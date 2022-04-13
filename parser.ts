import { parser } from "lezer-python";
import { TreeCursor } from "lezer";
import {Program,Expr,Stmt,UniOp,BinOp,TypedVar,Type,FunDef,VarInit,Literal,Scope} from "./ast";
//import * as BaseException from "./error";
export const NUM: Type = { tag: "num" };
export const BOOL: Type = { tag: "bool" };
export const NONE: Type = { tag: "none" };


export function traverseLiteral(c: TreeCursor, s: string): Literal {
  switch (c.type.name) {
    case "Number":
      return {
        tag: "num",
        value: Number(s.substring(c.from, c.to)),
      };
    case "Boolean":
      return {
        tag: "bool",
        value: s.substring(c.from, c.to) === "True",
      };
    case "None":
      return {
        tag: "none",
      };
    default:
      throw new Error("Compile");
  }
}

export function traverseExpr(c: TreeCursor, s: string): Expr<null> {
  console.log(c.type.name)
  switch (c.type.name) {
    case "Number":
    case "Boolean":
    case "None":
      return {
        a: null,
        tag: "literal",
        value: traverseLiteral(c, s),
      };
    case "VariableName":
      return {
        tag: "id",
        name: s.substring(c.from, c.to),
      };
    case "CallExpression":
      c.firstChild();
      const callExpr = traverseExpr(c, s);
      c.nextSibling();
      let [args, kwargs] = traverseArguments(c, s);
      console.log(args)
      c.parent();
      if (callExpr.tag === "id") {
        const callName = callExpr.name;
        var expr: Expr<null>;
        if (callName === "print" || callName === "abs") {
          expr = {
            tag: "builtin1",
            name: callName,
            arg: args[0],
          };
        } else if (callName === "max" || callName === "min" || callName === "pow") {
          expr = {
            tag: "builtin2",
            name: callName,
            left: args[0],
            right: args[1],
          };
        } else {
          expr = {
          tag: "call",
          name: callName,
          arguments: args
          };
        }
        return expr;
      } else {
        throw new Error("CompileError");
      }

    case "BinaryExpression":
      c.firstChild();
      const lhsExpr = traverseExpr(c, s);
      c.nextSibling();
      var opStr = s.substring(c.from, c.to);
      var op;
      switch (opStr) {
        case "+":
          op = BinOp.Plus;
          break;
        case "-":
          op = BinOp.Minus;
          break;
        case "*":
          op = BinOp.Mul;
          break;
        case "//":
          op = BinOp.IDiv;
          break;
        case "%":
          op = BinOp.Mod;
          break;
        case "==":
          op = BinOp.Eq;
          break;
        case "!=":
          op = BinOp.Neq;
          break;
        case "<=":
          op = BinOp.Lte;
          break;
        case ">=":
          op = BinOp.Gte;
          break;
        case "<":
          op = BinOp.Lt;
          break;
        case ">":
          op = BinOp.Gt;
          break;
        case "is":
          op = BinOp.Is;
          break;
        default:
          throw new Error("CompileError");
      }
      c.nextSibling();
      const rhsExpr = traverseExpr(c, s);
      c.parent();
      return {
        tag: "binop",
        op: op,
        left: lhsExpr,
        right: rhsExpr,
      };

    case "ParenthesizedExpression":
      c.firstChild(); 
      c.nextSibling();
      var expr = traverseExpr(c, s);
      c.parent();
      return expr;
    case "UnaryExpression":
      c.firstChild();
      var opStr = s.substring(c.from, c.to);
      var op;
      switch (opStr) {
        case "-":
          op = UniOp.Neg;
          break;
        case "not":
          op = UniOp.Not;
          break;
        default:
          throw new Error("CompileError");
      }
      c.nextSibling();
      var expr = traverseExpr(c, s);
      c.parent();
      return {
        tag: "uniop",
        op: op,
        expr: expr,
      };
    default:
      throw new Error("CompileError");
  }
}

export function traverseArgumentValue(c: TreeCursor, s: string): Expr<null> {
  switch (c.type.name) {
    case "AssignOp":
      c.nextSibling();
      let val = traverseExpr(c, s);
      c.nextSibling();
      return val;
    default:
      return null;
  }
}

export function traverseArgument(c: TreeCursor, s: string): [string, Expr<null>] {
  switch (c.type.name) {
    case "VariableName":
      let potentialKeyword = s.substring(c.from, c.to);
      let potentialArgVal = traverseExpr(c, s); 
      c.nextSibling(); 
      let potentialKeywordArgVal = traverseArgumentValue(c, s);
      if (potentialKeywordArgVal !== null) {
        return [potentialKeyword, potentialKeywordArgVal];
      } else {
        return [null, potentialArgVal];
      }
    default:
      let argVal = traverseExpr(c, s);
      c.nextSibling(); 
      return [null, argVal];
  }
}

export function traverseArguments(
  c: TreeCursor,
  s: string
): [Array<Expr<null>>, Array<[string, Expr<null>]>] {
  c.firstChild(); 
  const args = [];
  const kwargs: Array<[string, Expr<null>]> = [];
  const seenKws: Array<string> = [];
  c.nextSibling();
  let traversedKeywordArg = false;
  while (c.type.name !== ")") {
    let arg = traverseArgument(c, s);
    if (arg[0] === null) {
      if (traversedKeywordArg === true) {
        throw new Error("CompileError");
      }
      args.push(arg[1]);
    } else {
      traversedKeywordArg = true;
      if (seenKws.indexOf(arg[0]) > -1) {
        throw new Error("CompileError");
      } else {
        kwargs.push(arg);
        seenKws.push(arg[0]);
      }
    }
    c.nextSibling(); 
  }
  c.parent(); 
  return [args, kwargs];
}

export function traverseStmt(c: TreeCursor, s: string): Stmt<null> {
  console.log(c.node.type.name)
  switch (c.node.type.name) {
    case "ReturnStatement":
      c.firstChild();
      var value: Expr<null>;
      if (c.nextSibling())
        value = traverseExpr(c, s);
      else value = { a: null, tag: "literal", value: { tag: "none" } };
      c.parent();
      return { a: null ,tag: "return", value };
    case "AssignStatement":
      c.firstChild();
      let na = s.substring(c.from, c.to);
      c.nextSibling(); 
      c.nextSibling(); 
      var value = traverseExpr(c, s);
      console.log(c)
      c.parent();
      return {
        a: null,
        tag: "assignment",
        name: na,
        value,
      };
    case "ExpressionStatement":
      c.firstChild();
      const expr = traverseExpr(c, s);
      c.parent(); 
      return { tag: "expr", expr: expr};
    case "IfStatement":
      c.firstChild();
      c.nextSibling();
      var cond = traverseExpr(c, s);
      c.nextSibling();
      c.firstChild();
      var thn = [];
      while (c.nextSibling()) {
        thn.push(traverseStmt(c, s));
      }
      c.parent();

      if (!c.nextSibling() || c.name !== "else") {
        throw new Error("CompileError");
      }
      c.nextSibling(); 
      c.firstChild();
      var els = [];
      while (c.nextSibling()) {
        els.push(traverseStmt(c, s));
      }
      c.parent();
      c.parent();
      return {
        tag: "if",
        cond: cond,
        thn: thn,
        els: els,
      };
    case "WhileStatement":
      c.firstChild();
      c.nextSibling();
      var cond = traverseExpr(c, s);
      c.nextSibling();

      var body = [];
      c.firstChild();
      while (c.nextSibling()) {
        body.push(traverseStmt(c, s));
      }
      c.parent();
      c.parent();
      return {
        tag: "while",
        cond,
        body,
      };
    case "PassStatement":
      return { tag: "pass"};
    default:
      throw new Error("CompileError");
  }
}


export function traverseType(c: TreeCursor, s: string): Type {
  switch (c.type.name) {
    case "VariableName":
      let name = s.substring(c.from, c.to);
      switch (name) {
        case "int":
          return NUM;
        case "bool":
          return BOOL;
        case "none":
          return NONE;
      }
    default:
      console.log("Should be MemberExpression: ", c, s);
      throw new Error("Unable to parse type");
  }
}

export function traverseTypeDef(c: TreeCursor, s: string): Type {
  switch (c.type.name) {
    case "TypeDef":
      c.firstChild(); 
      c.nextSibling();
      let typ = traverseType(c, s);
      c.parent();
      return typ;
    default:
      throw new Error("CompileError");
  }
}


export function traverseTypedVars(c: TreeCursor, s: string): Array<TypedVar> {
  c.firstChild(); 
  const parameters = [];
  c.nextSibling(); 
  let traversedDefaultValue = false; 
  while (c.type.name !== ")") {
    let name = s.substring(c.from, c.to);
    c.nextSibling();
    let typ = traverseTypeDef(c, s);
    if (typ !== null) {
      traversedDefaultValue = true;
      parameters.push({ name, type: typ});
    } else {
      if (traversedDefaultValue === true) {
        throw new Error("CompileError");
      }
      parameters.push({ name, type: typ });
    }

    c.nextSibling();
  }
  c.parent();
  return parameters;
}

export function traverseVarInit(c: TreeCursor, s: string): VarInit<null> {
  c.firstChild();
  var name = s.substring(c.from, c.to);
  c.nextSibling();

  if (c.type.name !== "TypeDef") {
    c.parent();
    throw new Error("CompileError");
  }
  c.firstChild();
  c.nextSibling();
  const type = traverseType(c, s);
  c.parent();

  c.nextSibling(); 
  c.nextSibling();
  var value = traverseLiteral(c, s);
  c.parent();
  return { name, type, value};
}

export function traverseScope(c: TreeCursor, s: string): Scope<null> {
  c.firstChild();
  var scope = s.substring(c.from, c.to);
  c.nextSibling();
  var name = s.substring(c.from, c.to);
  switch (scope) {
    case "global":
      c.parent();
      throw new Error("Glocal declaration not supported.");
    case "nonlocal":
      c.parent();
      return { tag: "nonlocal", name};
    default:
      throw new Error("Invalid ScopeStatement");
  }
}

export function traverseFunDef(c: TreeCursor, s: string): FunDef<null> {
  c.firstChild();
  c.nextSibling();
  var name = s.substring(c.from, c.to);
  c.nextSibling();
  var parameters = traverseTypedVars(c, s);
  c.nextSibling();
  let ret: Type = NONE;
  if (c.type.name === "TypeDef") {
    c.firstChild();
    ret = traverseType(c, s);
    c.parent();
    c.nextSibling();
  }
  c.firstChild();
  var inits = [];
  var body = [];

  const decls: Scope<null>[] = [];

  var hasChild = c.nextSibling();
  while (hasChild) {
    if (isVarInit(c, s)) {
      inits.push(traverseVarInit(c, s));
    } else if (isScope(c, s)) {
      decls.push(traverseScope(c, s));
    } else {
      break;
    }
    hasChild = c.nextSibling();
  }

  while (hasChild) {
    body.push(traverseStmt(c, s));
    hasChild = c.nextSibling();
  }

  c.parent();
  c.parent(); 

  return { name, parameters, ret, inits, decls, body };
}

export function isVarInit(c: TreeCursor, s: string): boolean {
  if (c.type.name === "AssignStatement") {
    c.firstChild();
    c.nextSibling();

    const isVar = (c.type.name as any) === "TypeDef";
    c.parent();
    return isVar;
  } else {
    return false;
  }
}

export function isScope(c: TreeCursor, s: string): boolean {
  if (c.type.name === "ScopeStatement") {
    return true;
  } else {
    return false;
  }
}

export function isFunDef(c: TreeCursor, s: string): boolean {
  return c.type.name === "FunctionDefinition";
}


export function traverse(c: TreeCursor, s: string): Program<null> {
  switch (c.node.type.name) {
    case "Script":
      const inits: Array<VarInit<null>> = [];
      const funs: Array<FunDef<null>> = [];
      const stmts: Array<Stmt<null>> = [];
      var hasChild = c.firstChild();

      while (hasChild) {
        if (isVarInit(c, s)) {
          inits.push(traverseVarInit(c, s));
        } else if (isFunDef(c, s)) {
          funs.push(traverseFunDef(c, s));
        }else {
          break;
        }
        hasChild = c.nextSibling();
      }

      while (hasChild) {
        stmts.push(traverseStmt(c, s));
        hasChild = c.nextSibling();
      }
      c.parent();
      console.log("parser-output:", { funs, inits, stmts });
      return { funs, inits, stmts };
    default:
      throw new Error();
  }
}
export function parse(source: string): Program<null> {
  const t = parser.parse(source);
  return traverse(t.cursor(), source);
}