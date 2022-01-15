export class Logger {
  static Default = new Logger();
  static Client = Logger.Default.withPrefix('[Client]');
  static Socket = Logger.Default.withPrefix('[Socket]');
  static Peer = Logger.Default.withPrefix('[Peer]');
  static VPeer = Logger.Default.withPrefix('[VPeer]');

  private constructor(
    private readonly prefix: string[] = [],
    private readonly debugMode = true
  ) {
    if (!debugMode) {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      this.debug = () => {};
    }
  }

  public withPrefix(prefix: string): Logger {
    return new Logger([...this.prefix, prefix], this.debugMode);
  }

  public debug(...data: any[]): void {
    console.log(...this.prefix, ...data);
  }

  public log(...data: any[]): void {
    console.info(...this.prefix, ...data);
  }

  public warn(...data: any[]): void {
    console.warn(...this.prefix, ...data);
  }

  public error(...data: any[]): void {
    console.error(...this.prefix, ...data);
  }
}
