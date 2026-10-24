/**
 * The few web-standard globals the core uses. Every runtime Sync supports has them (Chrome, Edge, Node 22, Electron);
 * they are declared here because the core's lib is plain ES, which keeps DOM and Node APIs out of it.
 */
declare class URL {
  constructor(url: string, base?: string);
  readonly protocol: string;
  readonly hostname: string;
  readonly username: string;
  readonly password: string;
  readonly search: string;
  readonly hash: string;
  readonly origin: string;
  readonly pathname: string;
  readonly href: string;
}
