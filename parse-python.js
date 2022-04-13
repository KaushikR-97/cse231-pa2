const python = require('lezer-python');

const input = "def gn(x: int) -> int:\n x = 5 \ngn(5)";

const tree = python.parser.parse(input);

const cursor = tree.cursor();

do {
  console.log(cursor.node.type.name);
  console.log(input.substring(cursor.node.from, cursor.node.to));
} while(cursor.next());

