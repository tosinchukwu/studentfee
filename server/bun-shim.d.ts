// Minimal typings for the Bun runtime APIs the local server uses.
declare const Bun: {
  serve(options: {
    port: number
    hostname?: string
    fetch(request: Request): Response | Promise<Response>
  }): unknown
  file(path: string): Blob & { exists(): Promise<boolean> }
}
