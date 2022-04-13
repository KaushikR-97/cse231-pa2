import wabt from 'wabt';
import { parse } from "./parser";
import {Stmt,Expr,UniOp,BinOp,Type,Program,Literal,FunDef,VarInit,} from "./ast";
import {GlobalTypeEnv, tc ,defaultTypeEnv} from "./tc"
import { NUM, BOOL, NONE } from "./parser";

export type GlobalEnv = {
  globals: Map<string, number>;
  locals: Map<string, number>; 
  funs: Map<string, [number, Array<string>]>;
};

export const emptyEnv: GlobalEnv = {
  globals: new Map(),
  locals: new Map(),
  funs: new Map(),
};

export async function run(watSource : string, config: any) : Promise<any> {
  const wabtApi = await wabt();

  const parsed = wabtApi.parseWat("example", watSource);
  const binary = parsed.toBinary({});
  const wasmModule = await WebAssembly.instantiate(binary.buffer, config);
  return (wasmModule.instance.exports as any)._start();
}

export function makeLocals(locals: Set<string>): Array<string> {
  const localDefines: Array<string> = [];
  locals.forEach((v) => {
    localDefines.push(`(local $${v} i32)`);
  });
  return localDefines;
}


function envLookup(env: GlobalEnv, name: string): number {
  if (!env.globals.has(name)) {
    console.log("Could not find " + name + " in ", env);
    throw new Error(
      "Report this as a bug to the compiler developer, this shouldn't happen "
    );
  }
  console.log(env.globals.get(name));
  return env.globals.get(name);
}

function codeGenStmt(stmt: Stmt<Type>, env: GlobalEnv): Array<string> {
  switch(stmt.tag) {
    case "return":
      var valStmts = codeGenExpr(stmt.value, env);
      valStmts.push("(return)");
      return valStmts;
    case "assignment":
      console.log("Starting")
      let valueCode = codeGenExpr(stmt.value, env);
      if (env.locals.has(stmt.name))
         valueCode.push(`(local.set $${stmt.name})`);
      else
         valueCode.push(`(global.set $${stmt.name})`);
      console.log(valueCode)
      return valueCode;
    case "expr":
      var exprStmts = codeGenExpr(stmt.expr, env);
      exprStmts.push(`(local.set $scratch)`)
      return exprStmts;
    case "if":
      var condExpr = codeGenExpr(stmt.cond, env);  
      var thnStmts = stmt.thn.map((innerStmt) => codeGenStmt(innerStmt, env)).flat();
      var elsStmts = stmt.els.map((innerStmt) => codeGenStmt(innerStmt, env)).flat();
      return condExpr
        .concat(["(if (then"])
        .concat(thnStmts)
        .concat([")", "(else"])
        .concat(elsStmts)
        .concat(["))"]);
    case "while":
      var wcondExpr = codeGenExpr(stmt.cond, env);
      var bodyStmts = stmt.body.map((innerStmt) => codeGenStmt(innerStmt, env)).flat();
      return ["(block (loop (br_if 1"]
        .concat(wcondExpr)
        .concat(["(i32.eqz))"])
        .concat(bodyStmts)
        .concat(["(br 0) ))"]);
    case "pass":
      return [];
  }
}

function codeGenInit(init: VarInit<Type>, env: GlobalEnv): Array<string> {
  const value = codeGenLiteral(init.value);
  if (env.locals.has(init.name)) {
    return [...value, `(local.set $${init.name})`];
  } else {
    let d = envLookup(env,init.name)
      return [...value, `(global.set $${init.name})`];
  }
}

export function compile(source : string) : string {
  const ast = parse(source);
  console.log(ast)
  let EnvL = defaultTypeEnv;
  let Env2 = {funs : new Map(), globals : new Map() , locals : new Map()}
  const ast1 = tc(EnvL,ast)[0];
  console.log(ast)
  const vars : Array<string> = [];
  const varinitscode :Array<string>= [];
  ast1.inits.forEach((stmt, i) => {
    if (stmt.value.tag === "num" || stmt.value.tag === "bool"){
      Env2.globals.set(stmt.name,stmt.value.value)
      varinitscode.push(codeGenInit(stmt , Env2).join("\n"));
    } 
  });
  console.log(varinitscode)
  const varfunccode:Array<string> = [];
  ast1.funs.forEach((f) =>{
    varfunccode.push(codeGenFunDef(f , Env2).join("\n"));
  });
  const stscode:Array<string> = [];
  var vari: Set<string> = new Set();
  ast1.stmts.forEach((s) =>{
    if (s.tag === "assignment"){
         Env2.globals.set(s.name,s.value)
         vari.add(s.name)
    }
    stscode.push(codeGenStmt(s , Env2).join("\n"));
  });
  const allVat = varinitscode.join("\n\n")
  const main = [`(local $scratch i32)`,allVat,...stscode].join("\n");
  const allFuns = varfunccode.join("\n\n");
  var retType = "";
  var retVal = "";
  console.log(ast1.a)
  if(ast1.a === NUM || ast1.a === BOOL ) {
    retType = "(result i32)";
    retVal = "(local.get $scratch)"
  }
  let varit: string = null;
  var varDecls = ast1.inits.map(v => `(global $${v.name} (mut i32) (i32.const 0))`).join("\n");
  if ( vari.size > 0){
    vari.forEach(v => varit = varit + `(global $${v} (mut i32) (i32.const 0))\n`)
    varit = varit.replace(null,"");
    var varDecls= varDecls.concat(varit);
  }
  return `
    (module
      (func $print_num (import "imports" "print_num") (param i32) (result i32))
      (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
      (func $print_none (import "imports" "print_none") (param i32) (result i32))
      (func $abs (import "imports" "abs")(param i32) (result i32))
      (func $max (import "imports" "max")(param i32 i32) (result i32))
      (func $min (import "imports" "min")(param i32 i32) (result i32))
      (func $pow (import "imports" "pow")(param i32 i32) (result i32))
      ${varDecls}
      ${allFuns}
      (func (export "_start") ${retType}
        ${main}
        ${retVal}
      )
    ) 
  `;
}
function codeGenFunDef(def: FunDef<Type>, env: GlobalEnv): Array<string> {
  var definedVars: Set<string> = new Set();
  def.inits.forEach((v) => definedVars.add(v.name));

  let currLocalIndex = 0;
  var params = def.parameters
    .map((p) => {
      env.locals.set(p.name, currLocalIndex);
      currLocalIndex += 1;
      return `(param $${p.name} i32)`;
    })
    .join(" ");

  definedVars.forEach((v) => {
    env.locals.set(v, currLocalIndex);
    currLocalIndex += 1;
  });
  

  const locals = makeLocals(definedVars);
  const inits = def.inits.map((init) => codeGenInit(init, env)).flat();
  var stmts = def.body.map((innerStmt) => codeGenStmt(innerStmt, env)).flat();
  var initsb = inits.join("\n")
  var stmtsbody = stmts.join("\n")
  env.locals.clear();

  return [`(func $${def.name} ${params} (result i32)
        (local $scratch i32)
        ${locals}
        ${initsb}
        ${stmtsbody}
        (i32.const 0))`];
}

function codeGenExpr(expr: Expr<Type>, env: GlobalEnv): Array<string> {
  switch (expr.tag) {
    case "builtin1":
      const argTyp = expr.a;
      const argStmts = codeGenExpr(expr.arg, env);
      var callName = expr.name;
      if (expr.name === "print" && argTyp === NUM) {
        return argStmts.concat([`(call $print_num)`]);
      } else if (expr.name === "print" && argTyp === BOOL) {
        return argStmts.concat([`(call $print_bool)`]);
      } else if (expr.name === "print" && argTyp === NONE) {
        return argStmts.concat([`(call $print)`]);
      }
      return argStmts.concat([`(call $${expr.name})`]);
    case "builtin2":
      const leftStmts = codeGenExpr(expr.left, env);
      const rightStmts = codeGenExpr(expr.right, env);
      return [...leftStmts, ...rightStmts, `(call $${expr.name})`];
    case "literal":
      return codeGenLiteral(expr.value);
    case "id":
      if (env.locals.has(expr.name)) {
        return [`(local.get $${expr.name})`];
      } else {
        console.log(envLookup(env,expr.name))
        return [`(global.get $${expr.name})`];
      }
    case "binop":
      const lhsStmts = codeGenExpr(expr.left, env);
      const rhsStmts = codeGenExpr(expr.right, env);
      if (expr.op == BinOp.Is) {
        const type1 = expr.left.a;
        const type2 = expr.right.a;
        let result:boolean = null;
          if (type1 == NONE) {
            result = true
          }
          else {
            result = (type1 == type2)
          }
          return codeGenLiteral({tag:"bool", value:result});
      } else {
        return [...lhsStmts, ...rhsStmts, codeGenBinOp(expr.op)];
      }
    case "uniop":
      const exprStmts = codeGenExpr(expr.expr, env);
      switch (expr.op) {
        case UniOp.Neg:
          return [`(i32.const 0)`].concat(exprStmts).concat([`(i32.sub)`]);
        case UniOp.Not:
          return exprStmts.concat([`(i32.const 1)`, `(i32.xor)`]);
      }

    case "call":
      var valStmts = expr.arguments.map((arg) => codeGenExpr(arg, env)).flat();
      valStmts = valStmts.concat(`(call $${expr.name})`);
      return valStmts;
    default:
          throw new Error(
            "Code gen for bracket-lookup for types other than dict not implemented"
          );
      }
  
}

function codeGenLiteral(literal: Literal): Array<string> {

  switch (literal.tag) {
    case "num":
        return [`(i32.const ${literal.value})`];
    case "bool":
      if (literal.value === true)
        return [`(i32.const 1)`];
      else
        return [`(i32.const 0)`];
    case "none":
      return [`(i32.const 0)`];
  }
}

function codeGenBinOp(op: BinOp): string {
  switch (op) {
    case BinOp.Plus:
      return `(i32.add)`
    case BinOp.Minus:
      return `(i32.sub)`
    case BinOp.Mul:
      return `(i32.mul)`
    case BinOp.IDiv:
      return `(i32.mul)`;
    case BinOp.Mod:
      return `(i32.rem_s)`
    case BinOp.Eq:
      return `(i32.eq)`
    case BinOp.Neq:
      return `(i32.ne)`
    case BinOp.Lte:
      return `(i32.le_s)`
    case BinOp.Gte:
      return `(i32.ge_s)`
    case BinOp.Lt:
      return `(i32.lt_s)`;
    case BinOp.Gt:
      return `(i32.gt_s)`
    case BinOp.Is:
      return "(i32.eq)";
  }
}