const text = `?? : . : ????  ?? : ??????ain?
?? : ???`;

console.log("text length:", text.length);
console.log("char codes at start:", [...text.slice(0, 4)].map((c) => c.charCodeAt(0)));

const p1 = /??\s*[:?.]?\s*([\s\S]{2,40}?)\s*(?:??|??)/i;
console.log("p1:", text.match(p1));

const p2 = /\uC5C5\s*\uD0DC\s*[:?.]?\s*([\s\S]{2,40}?)\s*(?:\uC885\s*\uBAA9|\uC5C5\s*\uC885)/i;
console.log("p2:", text.match(p2));

const idx = text.indexOf("??");
console.log("idx ??:", idx, JSON.stringify(text.slice(0, idx + 10)));
