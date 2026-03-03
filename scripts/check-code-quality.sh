#!/bin/bash

# Code Quality Check script for BlackBolt Operator
# Runs all quality checks and generates report

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
REPORT_FILE="code-quality-report-$TIMESTAMP.txt"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Initialize report
REPORT="Code Quality Report\n"
REPORT+="Generated: $(date)\n"
REPORT+="Repository: $REPO_ROOT\n"
REPORT+="============================================\n\n"

CHECKS_PASSED=0
CHECKS_FAILED=0

echo -e "${BLUE}Code Quality Check Suite${NC}"
echo "Repository: $REPO_ROOT"
echo ""

# Check 1: SwiftLint
echo -e "${BLUE}[1/4] Running SwiftLint...${NC}"
REPORT+="\n1. SwiftLint Analysis\n"
REPORT+="------------------\n"

if command -v swiftlint &> /dev/null; then
  if swiftlint lint --config "$REPO_ROOT/.swiftlint.yml" 2>&1 | tee -a /tmp/swiftlint-report.txt; then
    echo -e "${GREEN}✓ SwiftLint passed${NC}"
    REPORT+="Status: PASSED\n"
    ((CHECKS_PASSED++))
  else
    echo -e "${RED}✗ SwiftLint found issues${NC}"
    REPORT+="Status: FAILED\n"
    ((CHECKS_FAILED++))
  fi
  REPORT+="Details:\n$(cat /tmp/swiftlint-report.txt)\n"
else
  echo -e "${YELLOW}⚠ SwiftLint not installed${NC}"
  REPORT+="Status: SKIPPED (not installed)\n"
fi

# Check 2: SwiftFormat (lint mode)
echo -e "${BLUE}[2/4] Running SwiftFormat (check mode)...${NC}"
REPORT+="\n2. SwiftFormat Check\n"
REPORT+="------------------\n"

if command -v swiftformat &> /dev/null; then
  if swiftformat . --config "$REPO_ROOT/.swiftformat" --lint 2>&1 | tee -a /tmp/swiftformat-report.txt; then
    echo -e "${GREEN}✓ Code formatting is correct${NC}"
    REPORT+="Status: PASSED\n"
    ((CHECKS_PASSED++))
  else
    echo -e "${YELLOW}⚠ Formatting issues detected${NC}"
    REPORT+="Status: NEEDS ATTENTION\n"
    ((CHECKS_FAILED++))
  fi
  REPORT+="Details:\n$(cat /tmp/swiftformat-report.txt)\n"
else
  echo -e "${YELLOW}⚠ SwiftFormat not installed${NC}"
  REPORT+="Status: SKIPPED (not installed)\n"
fi

# Check 3: git-secrets
echo -e "${BLUE}[3/4] Running git-secrets scan...${NC}"
REPORT+="\n3. Secret Detection (git-secrets)\n"
REPORT+="--------------------------------\n"

if command -v git-secrets &> /dev/null; then
  if git secrets scan 2>&1 | tee -a /tmp/git-secrets-report.txt; then
    echo -e "${GREEN}✓ No secrets detected${NC}"
    REPORT+="Status: PASSED (No secrets found)\n"
    ((CHECKS_PASSED++))
  else
    echo -e "${RED}✗ Potential secrets detected${NC}"
    REPORT+="Status: FAILED (Secrets detected)\n"
    ((CHECKS_FAILED++))
  fi
  REPORT+="Details:\n$(cat /tmp/git-secrets-report.txt)\n"
else
  echo -e "${YELLOW}⚠ git-secrets not installed${NC}"
  REPORT+="Status: SKIPPED (not installed)\n"
  REPORT+="Install with: brew install git-secrets\n"
fi

# Check 4: Configuration validation
echo -e "${BLUE}[4/4] Validating configuration files...${NC}"
REPORT+="\n4. Configuration Validation\n"
REPORT+="---------------------------\n"

CONFIG_VALID=true

if [ -f "$REPO_ROOT/.swiftlint.yml" ]; then
  if command -v yamllint &> /dev/null; then
    if yamllint "$REPO_ROOT/.swiftlint.yml" 2>&1 | tee -a /tmp/yamllint-report.txt; then
      echo -e "${GREEN}✓ .swiftlint.yml is valid${NC}"
      REPORT+="✓ .swiftlint.yml is valid\n"
    else
      echo -e "${YELLOW}⚠ .swiftlint.yml has issues${NC}"
      REPORT+="⚠ .swiftlint.yml has issues\n"
      CONFIG_VALID=false
    fi
  fi
else
  echo -e "${YELLOW}⚠ .swiftlint.yml not found${NC}"
  REPORT+="⚠ .swiftlint.yml not found\n"
fi

if [ "$CONFIG_VALID" = true ]; then
  echo -e "${GREEN}✓ All configurations valid${NC}"
  REPORT+="Status: PASSED\n"
  ((CHECKS_PASSED++))
else
  echo -e "${YELLOW}⚠ Configuration issues detected${NC}"
  REPORT+="Status: NEEDS ATTENTION\n"
  ((CHECKS_FAILED++))
fi

# Summary
echo ""
echo -e "${BLUE}Summary${NC}"
echo "============================================"
REPORT+="\n\nSummary\n"
REPORT+="=======\n"
REPORT+="Checks Passed: $CHECKS_PASSED\n"
REPORT+="Checks Failed: $CHECKS_FAILED\n"

if [ $CHECKS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed!${NC}"
  REPORT+="Overall Status: PASSED\n"
  RESULT=0
else
  echo -e "${RED}✗ Some checks failed${NC}"
  REPORT+="Overall Status: FAILED\n"
  RESULT=1
fi

# Save report
echo ""
echo "Report saved to: $REPO_ROOT/$REPORT_FILE"
echo -e "$REPORT" > "$REPO_ROOT/$REPORT_FILE"

# Cleanup
rm -f /tmp/swiftlint-report.txt /tmp/swiftformat-report.txt /tmp/git-secrets-report.txt /tmp/yamllint-report.txt

exit $RESULT
