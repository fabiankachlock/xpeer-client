// @internal
export class Logger {
  static Default = new Logger();
  static Client = Logger.Default.withPrefix('[Client]');
  static Socket = Logger.Default.withPrefix('[Socket]');
  static Peer = Logger.Default.withPrefix('[Peer]');
  static VPeer = Logger.Default.withPrefix('[VPeer]');
  static Queue = Logger.Default.withPrefix('[Queue]');

  private constructor(
    private readonly prefix: string[] = [],
    private readonly debugMode = false
  ) {
    this.enabledDebug(debugMode);
  }

  private enabledDebug(isEnabled: boolean): void {
    if (!isEnabled) {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      this.debug = () => {};
    } else {
      this.debug = (...data: any[]): void =>
        console.log(...this.prefix, ...data);
    }
  }

  static setDebugMode(isEnabled: boolean): void {
    Logger.Default.enabledDebug(isEnabled);
    Logger.Client.enabledDebug(isEnabled);
    Logger.Socket.enabledDebug(isEnabled);
    Logger.Peer.enabledDebug(isEnabled);
    Logger.VPeer.enabledDebug(isEnabled);
    Logger.Queue.enabledDebug(isEnabled);
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
