#!/bin/bash
# =============================================================================
# Chain Switching Helper Script
# =============================================================================
# Usage: ./scripts/switch-chain.sh robinhood|base|mainnet
#
# This script copies the appropriate chain configuration file to .env
# making it easy to switch between different blockchain networks.
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check if chain argument is provided
if [ $# -eq 0 ]; then
    echo ""
    echo "Chain Switching Helper for Base Trading Bot"
    echo "=========================================="
    echo ""
    echo "Usage: ./scripts/switch-chain.sh <chain>"
    echo ""
    echo "Available chains:"
    echo "  robinhood  - Robinhood Chain (Chain ID 4663, L2, low gas)"
    echo "  base       - Base Chain (Chain ID 8453, L2, low gas)"
    echo "  mainnet    - Ethereum Mainnet (Chain ID 1, L1, high gas)"
    echo ""
    echo "Examples:"
    echo "  ./scripts/switch-chain.sh robinhood"
    echo "  ./scripts/switch-chain.sh base"
    echo "  ./scripts/switch-chain.sh mainnet"
    echo ""
    exit 1
fi

CHAIN=$1

# Validate chain argument
case "$CHAIN" in
    robinhood|base|mainnet)
        ;;
    *)
        print_error "Invalid chain: $CHAIN"
        echo ""
        echo "Valid options are: robinhood, base, mainnet"
        exit 1
        ;;
esac

# Check if source file exists
SOURCE_FILE="$PROJECT_DIR/.env.$CHAIN"
if [ ! -f "$SOURCE_FILE" ]; then
    print_error "Configuration file not found: .env.$CHAIN"
    echo ""
    echo "Make sure you're running this from the project root directory."
    exit 1
fi

# Backup existing .env if it exists
if [ -f "$PROJECT_DIR/.env" ]; then
    BACKUP_FILE="$PROJECT_DIR/.env.backup.$(date +%Y%m%d_%H%M%S)"
    print_warning "Existing .env found, backing up to: .env.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$PROJECT_DIR/.env" "$BACKUP_FILE"
fi

# Copy the chain-specific config to .env
cp "$SOURCE_FILE" "$PROJECT_DIR/.env"

# Display chain-specific information
echo ""
print_success "Switched to $CHAIN configuration!"
echo ""

case "$CHAIN" in
    robinhood)
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  🤖 ROBINHOOD CHAIN"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  Chain ID:    4663"
        echo "  RPC:         https://rpc.robinhoodchain.com"
        echo "  Gas Cost:    Very Low (~$0.001 per tx)"
        echo "  Best For:    Testing, small positions, high frequency"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ;;
    base)
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  🔵 BASE CHAIN"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  Chain ID:    8453"
        echo "  RPC:         https://base.llamarpc.com"
        echo "  Gas Cost:    Low (~$0.01-0.10 per tx)"
        echo "  Best For:    Production, medium positions, good liquidity"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ;;
    mainnet)
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  ⬡ ETHEREUM MAINNET"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  Chain ID:    1"
        echo "  RPC:         https://eth.llamarpc.com"
        echo "  Gas Cost:    HIGH ($5-50+ per tx)"
        echo "  Best For:    Large positions, highest liquidity"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        print_warning "Mainnet has HIGH gas costs! Use larger position sizes."
        ;;
esac

echo ""
print_info "Next steps:"
echo "  1. Edit .env and add your PRIVATE_KEY"
echo "  2. Add your ZEROX_API_KEY (optional but recommended)"
echo "  3. Review and adjust the grid settings"
echo "  4. Run: npm run build && npm start"
echo ""
print_info "Your .env file is ready at: $PROJECT_DIR/.env"
echo ""
