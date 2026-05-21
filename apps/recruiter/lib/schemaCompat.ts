import { sql } from '@cap/db';

export async function tableColumnExists(
  tableSchema: string,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const [row] = await sql<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = ${tableSchema}
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS exists
  `;
  return row?.exists ?? false;
}
