export class Subscription {
  constructor(public readonly id: string, public readonly cancel: () => void) {}
}
