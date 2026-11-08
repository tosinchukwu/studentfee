// Minimal typings for the Bun runtime APIs the server uses.
declare module 'bun:sqlite' {
  interface Statement {
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
    run(...params: unknown[]): void
  }
  export class Database {
    constructor(path: string, options?: { create?: boolean })
    exec(sql: string): void
    query(sql: string): Statement
  }
}

declare const Bun: {
  serve(options: {
    port: number
    hostname?: string
    fetch(request: Request): Response | Promise<Response>
  }): unknown
  file(path: string): Blob & { exists(): Promise<boolean> }
}
