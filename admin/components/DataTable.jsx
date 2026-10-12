function DataTable({ columns, rows, rowKey }) {
  return (
    <table className="w-full bg-surface">
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className="border-b border-line px-2.5 py-2 text-left align-top text-[0.86rem] font-strong text-muted"
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
              <td key={column.key} className="border-b border-line px-2.5 py-2 text-left align-top">
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
