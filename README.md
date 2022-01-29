# xpeer-client

A Javascript client implementing the [xpeer spec](https://github.com/fabiankachlock/xpeer-server/blob/main/spec.md)

> **XPeer is currently in beta and under heavy development.** Make sure, that your client version is compatible with your server version.

## Installation

`npm i @xpeer/client`
or
`yarn add @xpeer/client`

## Usage

Create a connection to a Relay Server:

`const client = XPeer.createConnection('wss://my-server.com/xpeer')`

## Documentation

> Docs are currently in progress..., please refer to the xpeer.ts file for now.

## Servers

Currently only a server implementation in Golang is available. You can find it [here](https://github.com/fabiankachlock/xpeer-server/).
