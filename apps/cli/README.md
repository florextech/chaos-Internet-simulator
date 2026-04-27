# chaos-net CLI

Command line interface for Chaos Internet Simulator.

## Install

```bash
npm install -g @florextech/chaos-net
```

## Usage

```bash
chaos-net status
chaos-net start
chaos-net off
chaos-net profile unstable-api
chaos-net logs
chaos-net scenario bad-mobile-network
chaos-net scenario off
chaos-net record start
chaos-net record stop
chaos-net replay sample.json
chaos-net replay off
```

By default it connects to `http://localhost:8081`.

Override with:

```bash
export CHAOS_CONTROL_API_URL=http://localhost:8081
```
