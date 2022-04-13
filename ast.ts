export type Type =
  | { tag: "num" }
  | { tag: "bool" }
  | { tag: "none" }

export type Scope<A> =
  | { a?: A; tag: "global"; name: string } 
  | { a?: A; tag: "nonlocal"; name: string };

export type TypedVar = { name: string; type: Type; value?: Literal };

export type Program<A> = {
  a?: A;
  funs: Array<FunDef<A>>;
  inits: Array<VarInit<A>>;
  stmts: Array<Stmt<A>>;
};

export type VarInit<A> = { a?: A; name: string; type: Type; value?: Literal };

export type FunDef<A> = {a?: A; name: string; parameters: Array<TypedVar>; ret: Type; decls: Array<Scope<A>>; inits: Array<VarInit<A>>; body: Array<Stmt<A>>;};

export type Stmt<A> =
  | { a?: A; tag: "assignment"; name: string; value: Expr<A> }
  | { a?: A; tag: "return"; value: Expr<A> }
  | { a?: A; tag: "expr"; expr: Expr<A> }
  | { a?: A; tag: "if"; cond: Expr<A>; thn: Array<Stmt<A>>; els: Array<Stmt<A>> }
  | { a?: A; tag: "while"; cond: Expr<A>; body: Array<Stmt<A>> }
  | { a?: A; tag: "pass" }

export type Expr<A> =
  | { a?: A; tag: "literal"; value: Literal }
  | { a?: A; tag: "binop"; op: BinOp; left: Expr<A>; right: Expr<A> }
  | { a?: A; tag: "uniop"; op: UniOp; expr: Expr<A> }
  | { a?: A; tag: "builtin1"; name: string; arg: Expr<A> }
  | { a?: A; tag: "builtin2"; name: string; left: Expr<A>; right: Expr<A> }
  | { a?: A; tag: "call"; name: string; arguments: Array<Expr<A>> }
  | { a?: A; tag: "id"; name: string }

export type Literal =
  | { tag: "num"; value: number }
  | { tag: "bool"; value: boolean }
  | { tag: "none" };

export enum BinOp {Plus,Minus,Mul,IDiv,Mod,Eq,Neq,Lte,Gte,Lt,Gt,Is,}

export enum UniOp {Neg,Not}