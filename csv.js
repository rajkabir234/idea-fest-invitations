export function importNames(source) {
  const text = source.replace(/^\uFEFF/, "");
  const field = /(?:"((?:[^"]|"")*)"|([^",\r\n]*))(,|\r\n|\n|\r|$)/y;
  const rows = [];
  let row = [];
  let offset = 0;

  while (offset < text.length) {
    field.lastIndex = offset;
    const match = field.exec(text);
    if (!match) throw new Error("Invalid CSV. Check that quoted fields are closed.");
    offset = field.lastIndex;
    row.push((match[1]?.replaceAll('""', '"') ?? match[2]).trim());
    if (match[3] === ",") {
      if (offset === text.length) row.push("");
      else continue;
    }
    if (row.some(Boolean)) rows.push(row);
    row = [];
  }

  if (!rows.length) throw new Error("This CSV is empty.");
  const column = rows[0].findIndex(value => /^(?:full[ _-]?)?name$/i.test(value));
  if (column === -1) throw new Error("Add a Name column to the CSV and try again.");
  const names = rows.slice(1).map(values => values[column]?.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!names.length) throw new Error("The Name column doesn’t contain any guest names.");
  return names;
}

export function guestCsv(names) {
  const rows = names.map(name => '"' + name.replaceAll('"', '""') + '"');
  return "\uFEFFName\r\n" + rows.join("\r\n") + "\r\n";
}
