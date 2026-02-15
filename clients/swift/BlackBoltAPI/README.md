# BlackBoltAPI Swift Package

Generated and hand-authored client scaffolding for Black Bolt API.

## Generator

This package uses **Apple Swift OpenAPI Generator** only:
- `swift-openapi-generator` `1.10.4`
- `swift-openapi-runtime` `1.9.0`
- `swift-openapi-urlsession` `1.2.0`
- Swift toolchain minimum: `6.2.3`

## Generate

```bash
./scripts/gen-swift-client.sh
```

The generation script syncs `/Users/thewhitley/Documents/New project/contracts/openapi/blackbolt.v1.yaml` into this package and runs generator CLI codegen into `Sources/BlackBoltAPI`.
Builds do not run generator plugins.
