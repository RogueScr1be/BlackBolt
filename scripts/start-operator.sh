#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../clients/swift/BlackBoltOperator"
swift run BlackBoltOperator
