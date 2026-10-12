function DataTable({ columns, rows, rowKey }) {
  return (
    <table className="w-full bg-[#fffdf8] dark:bg-[#1e232b]">
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className="border-b border-[#ddd4c6] dark:border-[#343b46] px-2.5 py-2 text-left align-top text-[0.86rem] font-[650] text-[#5e584e] dark:text-[#b7b0a4]"
            >
              {column.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={rowKey(row, index)}>
            {columns.map((column) => (
              <td key={column.key} className="border-b border-[#ddd4c6] dark:border-[#343b46] px-2.5 py-2 text-left align-top">
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export { DataTable };
