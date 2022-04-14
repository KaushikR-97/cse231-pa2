import {Stmt,Expr,Type,UniOp,BinOp,Literal,Program,FunDef,VarInit,TypedVar} from "./ast";
import { NUM, BOOL,NONE } from "./parser";

export type GlobalTypeEnv = {
  globals: Map<string, Type>;
  functions: Map<string, [Array<TypedVar>, Type]>;
};

export type LocalTypeEnv = {
  vars: Map<string, Type>;
  expectedRet: Type;
  functions: Map<string, [Array<TypedVar>, Type]>;
  topLevel: boolean;
  loop_depth: number;
};

const defaultGlobalFunctions = new Map();
defaultGlobalFunctions.set("abs", [[{ type: NUM }], NUM]);
defaultGlobalFunctions.set("max", [[{ type: NUM }, { type: NUM }], NUM]);
defaultGlobalFunctions.set("min", [[{ type: NUM }, { type: NUM }], NUM]);
defaultGlobalFunctions.set("pow", [[{ type: NUM }, { type: NUM }], NUM]);

export const defaultTypeEnv = {
  globals: new Map(),
  functions: defaultGlobalFunctions,
};

export function emptyGlobalTypeEnv(): GlobalTypeEnv {
  return {
    globals: new Map(),
    functions: new Map(),
  };
}

export function emptyLocalTypeEnv(): LocalTypeEnv {
  return {
    vars: new Map(),
    expectedRet: NONE,
    functions: new Map(),
    topLevel: true,
    loop_depth: 0,
  };
}

export type TypeError = {
  message: string;
};

export function equalType(t1: Type, t2: Type): boolean {
  if (t1 === null) {
    return t2 === null;
  }
  return (
    JSON.stringify(t1) === JSON.stringify(t2) 
  );
}

export function isNoneOrClass(t: Type) {
  return t.tag === "none";
}


export function isSubtype(env: GlobalTypeEnv, t1: Type, t2: Type): boolean {
  return (
    equalType(t1, t2)
  );
}

export function isAssignable(env: GlobalTypeEnv, t1: Type, t2: Type): boolean {
  return isSubtype(env, t1, t2);
}

export function join(env: GlobalTypeEnv, t1: Type, t2: Type): Type {
  return NONE;
}

export function augmentTEnv(env: GlobalTypeEnv, program: Program<null>): GlobalTypeEnv {
  var newGlobs = new Map();
  var newFuns = new Map();
  if (env !== null){
    newGlobs = new Map(env.globals);
    newFuns = new Map(env.functions);
  }
  program.inits.forEach((init) => {
    if (newGlobs.has(init.name)) {
      throw new Error(`Duplicate variable ${init.name}`);
    }
    newGlobs.set(init.name, init.type);
  });
  program.funs.forEach((fun) => {
    newFuns.set(fun.name, [fun.parameters, fun.ret]);
    if (newGlobs.has(fun.name)) {
      throw new Error(`Duplicate variable ${fun.name}`);
    }
    newGlobs.set(fun.name, {
      tag: "none"
    });
  });
  return { globals: newGlobs, functions: newFuns };
}

export function tc(env: GlobalTypeEnv,program: Program<null>): [Program<Type>, GlobalTypeEnv] {
  const locals = emptyLocalTypeEnv();
  const newEnv = augmentTEnv(env, program);
  const tInits = program.inits.map((init) => tcInit(env, init));
  const tDefs = program.funs.map((fun) => tcDef(newEnv, fun));
  const tBody = tcBlock(newEnv, locals, program.stmts);
  var lastTyp: Type = NONE;
  if (tBody.length) {
    lastTyp = tBody[tBody.length - 1].a;
  }
  for (let name in locals.vars) {
    newEnv.globals.set(name, locals.vars.get(name));
  }
  const aprogram: Program<Type> = {
    a: lastTyp,
    inits: tInits,
    funs: tDefs,
    stmts: tBody,
  };
  return [aprogram, newEnv];
}

export function tcInit(env: GlobalTypeEnv, init: VarInit<null>): VarInit<Type> {
  const valTyp = tcLiteral(init.value);
  if (isAssignable(env, valTyp, init.type)) {
    return { ...init, a: init.a };
  } else {
    throw new Error("Type Error");
  }
}

export function tcDef(env: GlobalTypeEnv, fun: FunDef<null>): FunDef<Type> {
  var locals = emptyLocalTypeEnv();
  locals.expectedRet = fun.ret;
  locals.topLevel = false;

  fun.parameters.forEach((p) => {
    if (locals.vars.has(p.name)) {
      throw new Error(`Duplicate variable ${p.name}`);
    }
    locals.vars.set(p.name, p.type);
  });
  fun.inits.forEach((init) => {
    if (locals.vars.has(init.name)) {
      throw new Error(`Duplicate variable ${init.name}`);
    }
    locals.vars.set(init.name, tcInit(env, init).type);
  });
  fun.decls.forEach((decl) => {
    if (decl.tag == "nonlocal") {
      throw new Error(`Invalid Nonlocal Variable ${decl.name}`);
    }
    if (!env.globals.has(decl.name)) {
      throw new Error(`Invalid global Variable ${decl.name}`);
    }
    throw new Error(`Invalid global Variable ${decl.name}2`);
  });
  const tBody = tcBlock(env, locals, fun.body);
  return {
    ...fun,
    a: fun.a,
    body: tBody,
    decls: fun.decls.map((s) => {
      return { ...s, a: s.a };
    }), // TODO
    inits: fun.inits.map((s) => tcInit(env, s)),
  };
}
export function tcDefault(paramType: Type, paramLiteral: Literal) {
  if (paramLiteral === undefined) {
    return;
  } else if (paramLiteral.tag === "num" && paramType.tag === "num") {
    return;
  } else if (paramLiteral.tag !== paramType.tag) {
    throw new Error();
  }
}


export function tcBlock(
  env: GlobalTypeEnv,
  locals: LocalTypeEnv,
  stmts: Array<Stmt<null>>
): Array<Stmt<Type>> {
  return stmts.map((stmt) => tcStmt(env, locals, stmt));
}

export function tcStmt(
  env: GlobalTypeEnv,
  locals: LocalTypeEnv,
  stmt: Stmt<null>
): Stmt<Type> {
  switch (stmt.tag) {
    case "assignment":
      const tValueExpr = tcExpr(env, locals, stmt.value);
      return {
        a: stmt.a,
        tag: stmt.tag,
        name: stmt.name,
        value: tValueExpr,
      };
    case "expr":
      const tExpr = tcExpr(env, locals, stmt.expr);
      return { a: tExpr.a, tag: stmt.tag, expr: tExpr };
    case "if":
      locals.loop_depth += 1;
      var tCond = tcExpr(env, locals, stmt.cond);
      const tThn = tcBlock(env, locals, stmt.then_block);
      const thnTyp = tThn[tThn.length - 1].a;
      const ELif = tcBlock(env,locals,stmt.elif_block);
      const tEls = tcBlock(env, locals, stmt.else_block);
      // restore loop depth
      locals.loop_depth -= 1;
      console.log(tCond.a)
      if (tCond.a !== BOOL) throw new Error("ERROR!");
      return { a: thnTyp, tag: stmt.tag, cond: tCond, then_block: tThn, else_block: tEls ,elif_block:ELif };
    case "return":
      if (locals.topLevel)
        throw new Error("return outside of functions")
      const tRet = tcExpr(env, locals, stmt.value);
      if (!isAssignable(env, tRet.a, locals.expectedRet))
        throw new Error("error");
      return { a: tRet.a, tag: stmt.tag, value: tRet };
    case "while":
      const wlast_depth = locals.loop_depth;
      locals.loop_depth = 1;
      var tCond = tcExpr(env, locals, stmt.cond);
      const tBody = tcBlock(env, locals, stmt.body);
      locals.loop_depth = wlast_depth;
      if (!equalType(tCond.a, BOOL))
        throw new Error("ERROR");
      return { a: stmt.a, tag: stmt.tag, cond: tCond, body: tBody };
    case "pass":
      return { a: stmt.a, tag: stmt.tag };   
  }
}

export function tcExpr(
  env: GlobalTypeEnv,
  locals: LocalTypeEnv,
  expr: Expr<null>
): Expr<Type> {
  switch (expr.tag) {
    case "literal":
      return { ...expr, a: tcLiteral(expr.value) };
    case "binop":
      const tLeft = tcExpr(env, locals, expr.left);
      const tRight = tcExpr(env, locals, expr.right);
      const tBin = { ...expr, left: tLeft, right: tRight };
      switch (expr.op) {
        case BinOp.Plus:
        case BinOp.Minus:
        case BinOp.Mul:
        case BinOp.IDiv:
        case BinOp.Mod:
          if (equalType(tLeft.a, NUM) && equalType(tRight.a, NUM)) {
            return { ...tBin, a: NUM };
          } else {
            throw new Error("Incompatible Types");
          }
        case BinOp.Eq:
        case BinOp.Neq:
          if (equalType(tLeft.a, tRight.a)) {
            return { ...tBin, a: BOOL };
          } else {
            throw new Error("Incompatible Types");
          }
        case BinOp.Lte:
        case BinOp.Gte:
        case BinOp.Lt:
        case BinOp.Gt:
          if (equalType(tLeft.a, NUM) && equalType(tRight.a, NUM)) {
            return { ...tBin, a: BOOL };
          } else {
            throw new Error("Incompatible Types");
          }
        case BinOp.Is:
          if (!isNoneOrClass(tLeft.a) || !isNoneOrClass(tRight.a))
            throw new Error("Incompatible Types");
          return { ...tBin, a: BOOL };
      }
    case "uniop":
      const tExpr = tcExpr(env, locals, expr.expr);
      const tUni = { ...expr, a: tExpr.a, expr: tExpr };
      switch (expr.op) {
        case UniOp.Neg:
          if (equalType(tExpr.a, NUM)) {
            return tUni;
          } else {
            throw new Error();
          }
        case UniOp.Not:
          if (equalType(tExpr.a, BOOL)) {
            return tUni;
          } else {
            throw new Error("Incompatible Types");
          }
      }
    case "id":
      console.log(expr.name)
      if (locals.vars.has(expr.name)) {
        return { ...expr, a: locals.vars.get(expr.name) };
      } else if (env.globals.has(expr.name)) {
        return { ...expr, a: env.globals.get(expr.name) };
      } else {
        throw Error("Id not found");
      }
    case "builtin1":
      if (expr.name === "print") {
        const tArg = tcExpr(env, locals, expr.arg);
        return { ...expr, a: tArg.a, arg: tArg };
      } else if (env.functions.has(expr.name)) {
        const [[expectedParam], retTyp] = env.functions.get(expr.name);
        const tArg = tcExpr(env, locals, expr.arg);

        if (isAssignable(env, tArg.a, expectedParam.type)) {
          return { ...expr, a: expr.a, arg: tArg };
        } else {
          throw new Error("Incompatible Types");
        }
      } else {
        throw Error();
      }
    case "builtin2":
      if (env.functions.has(expr.name)) {
        const [[leftParam, rightParam], retTyp] = env.functions.get(expr.name);
        const tLeftArg = tcExpr(env, locals, expr.left);
        const tRightArg = tcExpr(env, locals, expr.right);
        if (
          isAssignable(env, leftParam.type, tLeftArg.a) &&
          isAssignable(env, rightParam.type, tRightArg.a)
        ) {
          return { ...expr, a: expr.a, left: tLeftArg, right: tRightArg };
        } else {
          throw new Error("Incompatible Types");
        }
      } else {
        throw Error("Incompatible Types");
      }
    
    case "call":
        let tArg = expr.arguments.map((arg) => tcExpr(env, locals, arg));
        let tRet = tArg[0].a;
        return { ...expr, a: tRet, arguments: tArg };
    default:
      throw new Error(`unimplemented type checking for expr: ${expr}`);
  }
}

export function tcLiteral(literal: Literal) {
  switch (literal.tag) {
    case "bool":
      return BOOL;
    case "num":
      return NUM;
    case "none":
      return NONE;
  }
}


export function populateDefaultParams(
  env: GlobalTypeEnv,
  tArgs: Expr<Type>[],
  actualArgs: Expr<Type>[],
  params: TypedVar[],
  kwargsMap: Map<string, Expr<Type>>,
){
  var augArgs = tArgs;
  var argNums = actualArgs.length;

  while (argNums < params.length) {
    const paramName = params[argNums].name;
    if (kwargsMap.has(paramName)) {
      augArgs = augArgs.concat(kwargsMap.get(paramName));
    } else if (params[argNums].value === undefined) {
      throw new Error("Missing parameter ${paramName} from call");
    } else {
      const default_value = params[argNums].value;
      switch (default_value.tag) {
        case "num":
        case "bool":
        case "none":
          augArgs = augArgs.concat({
            tag: "literal",
            value: default_value,
          });
          break;
        default:
          throw new Error("Default type not yet supported");
      }
    }
    argNums = argNums + 1;
  }
  return augArgs;
}