# BlackBolt Operator Swift macOS Deployment Guide

## Table of Contents
1. [System Requirements](#system-requirements)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Installation for Users](#installation-for-users)
4. [Running the App](#running-the-app)
5. [Updating the App](#updating-the-app)
6. [Uninstalling](#uninstalling)
7. [Troubleshooting Deployment](#troubleshooting-deployment)
8. [Monitoring After Deployment](#monitoring-after-deployment)
9. [Disaster Recovery](#disaster-recovery)

## System Requirements

### Minimum macOS Version

**Minimum**: macOS Sonoma (14.0) or later

**Recommended**: macOS Tahoe (15.0) or later

**Check Your Version**:
```bash
# View current macOS version
sw_vers

# Output:
# ProductName:        macOS
# ProductVersion:     15.1
# BuildVersion:       24B91
```

### Hardware Requirements

**Minimum**:
- **Processor**: Intel or Apple Silicon (M1/M2/M3/etc.)
- **RAM**: 2GB (4GB recommended)
- **Disk Space**: 100MB for application + 500MB for data

**Recommended**:
- **Processor**: Apple Silicon (M1 or newer)
- **RAM**: 8GB or more
- **Disk Space**: 1GB free for application and working data
- **Display**: Retina display (better UI experience)

### Network Requirements

- **Connection Type**: Internet access required
- **Protocol**: HTTPS (port 443)
- **Bandwidth**: 1+ Mbps for API communication
- **Firewall**: Must allow outbound HTTPS to API server

### Prerequisite Software

- **None required**: Application is self-contained
- **Optional**: Xcode (if compiling from source)
- **Recommended**: Git (for downloading source)

### Supported Architectures

- **Apple Silicon**: arm64 (M1/M2/M3/M4)
- **Intel**: x86_64 (Intel Macs)
- **Universal Binary**: Contains both architectures (auto-selects)

## Pre-Deployment Checklist

### Code Review Completion

- [ ] All code changes reviewed
- [ ] Security review completed
- [ ] No pending security TODOs
- [ ] Approved by security team

**Verification**:
```bash
# Check for security TODOs
grep -r "TODO.*security\|FIXME.*security" Sources/

# Ensure no outstanding security issues
git log --oneline | head -1  # Latest commit
```

### Test Coverage Verification

- [ ] Unit test coverage > 80%
- [ ] All critical paths tested
- [ ] Integration tests passing
- [ ] Security tests passing

**Verification**:
```bash
# Run full test suite
swift test

# Generate coverage report
swift test --enable-code-coverage

# Check coverage percentage
xcrun llvm-cov report \
  -instr-profile=.build/debug/codecov/default.profdata \
  .build/debug/BlackBoltOperatorTests
```

### Security Audit Completion

- [ ] Startup security audit passing
- [ ] Code signature validation passing
- [ ] Keychain access control verified
- [ ] Certificate pinning configured (if enabled)
- [ ] Request signing working correctly
- [ ] No hardcoded credentials found

**Verification**:
```bash
# Run security audit
swift run BlackBoltOperator
# Check console for: "Security audit: ✅ All checks passed"

# Verify no hardcoded secrets
grep -r "password\|secret\|api.?key\|token" \
  Sources/ Package.swift --include="*.swift" | \
  grep -v "//.*password"  # Ignore comments

# Check for plaintext credentials
strings .build/release/BlackBoltOperator | grep -i "api.*key\|password"
```

### Documentation Review

- [ ] README.md updated
- [ ] Changelog updated
- [ ] Known issues documented
- [ ] Breaking changes documented

**Verification**:
```bash
# Check file existence
ls -la README.md CHANGELOG.md

# Verify version documented
grep -i "version\|release" README.md | head -1
```

### Performance Validation

- [ ] App startup time < 3 seconds
- [ ] Memory usage stable
- [ ] No memory leaks
- [ ] UI responsive (60 FPS)

**Verification**:
```bash
# Measure startup time
time swift run -c release BlackBoltOperator < /dev/null

# Profile memory usage
swift run -c release BlackBoltOperator &
PID=$!
sleep 5
ps aux | grep $PID | grep -v grep
kill $PID
```

## Installation for Users

### Download Procedure

**Method 1: GitHub Releases**:
```
1. Visit: https://github.com/yourorg/BlackBoltOperator/releases
2. Find latest release
3. Download: BlackBoltOperator-X.X.X.zip
4. Extract to Downloads folder
```

**Method 2: Command Line**:
```bash
# Get latest version
curl -s https://api.github.com/repos/yourorg/BlackBoltOperator/releases/latest | \
  jq -r '.assets[] | select(.name | endswith(".zip")) | .browser_download_url'

# Download
curl -L -o BlackBoltOperator.zip <URL>

# Extract
unzip BlackBoltOperator.zip
```

### Disk Space Requirements

**Check Available Space**:
```bash
# Check free space on current drive
df -h / | tail -1

# Required space:
# - Application: 50-100MB
# - Configuration: 10-50MB
# - Logs: 100-500MB
# - Total: 500MB recommended

# If insufficient space, delete:
rm -rf ~/Library/Caches/BlackBoltOperator
rm -rf ~/Downloads/*
```

### Installation Steps

**Standard Installation**:
```
1. Open Downloads folder
2. Double-click BlackBoltOperator.zip (auto-extracts)
3. Open Applications folder (in sidebar)
4. Drag BlackBoltOperator.app to Applications
5. Wait for copy to complete
6. Eject Downloads folder
```

**Command Line Installation**:
```bash
# Copy to Applications
cp -r BlackBoltOperator.app /Applications/

# Verify installation
ls -la /Applications/BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator

# Make executable (if needed)
chmod +x /Applications/BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator
```

### Permission Requirements

**macOS Will Prompt For**:
- Network access (when first connecting to API)
- Keychain access (when storing credentials)
- No admin password required (sandbox restricted)

**Grant Permissions**:
```
1. When prompted: "Allow network connection?"
   → Click: "Allow"

2. When prompted: "BlackBolt Operator wants to access your keychain"
   → Click: "Always Allow" (or "Allow" for once)
```

### Verification After Installation

**Verify Installation**:
```bash
# Check bundle structure
ls -la /Applications/BlackBoltOperator.app/Contents/

# Verify code signature
codesign -v /Applications/BlackBoltOperator.app

# Test launch
open /Applications/BlackBoltOperator.app

# Should show: App launches and displays main interface
```

**Test Functionality**:
```
1. App should launch within 3 seconds
2. Main interface should display
3. Settings view should be accessible
4. No error messages in first 10 seconds
```

## Running the App

### Launching the Application

**Using Finder**:
```
1. Open Applications folder
2. Double-click BlackBoltOperator.app
3. App launches and goes to foreground
```

**Using Spotlight**:
```
1. Press Cmd+Space (Spotlight search)
2. Type "BlackBolt"
3. Press Enter to launch
```

**Using Command Line**:
```bash
open -a BlackBoltOperator
# or
/Applications/BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator
```

### First-Time Setup

**Configuration Required**:
```
1. App launches showing lock screen or settings
2. Enter API endpoint (HTTPS URL)
3. Enter operator key (32+ character secret)
4. Enter tenant ID (organizational identifier)
5. Click "Save Configuration"
6. App unlocks and shows main interface
```

**Configuration Storage**:
```bash
# Configuration stored in Keychain (encrypted)
security find-generic-password -a operator_key \
  ~/Library/Keychains/login.keychain-db

# App data stored in Application Support
ls -la ~/Library/Application\ Support/BlackBoltOperator/
```

### Configuration Management

**Update Configuration**:
```
1. Click Settings (gear icon)
2. Enter new values
3. Click "Save" or "Update"
4. App may restart
```

**Reset Configuration**:
```bash
# Via UI: Settings → Reset Configuration → Confirm

# Via command line:
rm -rf ~/Library/Application\ Support/BlackBoltOperator
# Restart app to reconfigure
```

### Credential Management

**Update Credentials**:
```
1. Settings → Credentials
2. Enter new API key
3. Enter new tenant ID
4. Click "Update"
5. App will test connectivity
```

**Credential Security**:
- Stored in Keychain (encrypted)
- Never logged or displayed
- Access requires device unlock
- Automatic rotation (90 days recommended)

## Updating the App

### Checking for Updates

**Manual Check**:
```
1. Help → Check for Updates
2. App queries GitHub releases
3. If new version available: "Update Available: X.X.X"
4. Click "Download Update"
```

**Automatic Check**:
- App may check on startup
- Check frequency: Daily or on-demand
- User notified if update available

### Download and Installation

**Update Process**:
```
1. Download notification appears
2. Click "Download" button
3. Update downloads (~50-100MB)
4. Click "Install Update"
5. App may require restart
6. New version launches
```

### Configuration Migration

**Automatic Migration**:
- User credentials automatically preserved
- Configuration settings carried forward
- Cache cleared before restart

**Verify After Update**:
```
1. Check version: Help → About BlackBolt Operator
2. Verify settings still present: Settings menu
3. Test API connectivity: Approvals view
4. No errors in logs
```

### Backup and Recovery

**Before Major Update**:
```bash
# Backup configuration
cp -r ~/Library/Application\ Support/BlackBoltOperator \
      ~/Library/Application\ Support/BlackBoltOperator-backup

# Backup Keychain items (if needed)
security export-identity -t certs -f pkcs12 \
  -o BlackBolt-certs.p12 \
  ~/Library/Keychains/login.keychain-db
```

**Restore If Update Fails**:
```bash
# Stop running app
killall BlackBoltOperator

# Restore from backup
rm -rf ~/Library/Application\ Support/BlackBoltOperator
cp -r ~/Library/Application\ Support/BlackBoltOperator-backup \
      ~/Library/Application\ Support/BlackBoltOperator

# Restart app
open -a BlackBoltOperator
```

## Uninstalling

### Removing the Application

**Standard Uninstall**:
```
1. Open Applications folder
2. Right-click BlackBoltOperator.app
3. Select "Move to Trash"
4. Empty Trash (Cmd+Delete)
```

**Command Line Uninstall**:
```bash
rm -rf /Applications/BlackBoltOperator.app
```

### Cleaning Up Configuration

**Remove User Data**:
```bash
# Remove configuration
rm -rf ~/Library/Application\ Support/BlackBoltOperator

# Remove cache
rm -rf ~/Library/Caches/BlackBoltOperator

# Remove logs
rm -rf ~/Library/Logs/BlackBoltOperator

# Remove preferences
defaults delete com.blackbolt.operator
```

### Credential Removal

**Clear from Keychain**:
```bash
# Find all BlackBolt items
security find-generic-password -s "operator" -l | grep BlackBolt

# Delete specific item
security delete-generic-password -a "operator_key" \
  ~/Library/Keychains/login.keychain-db

# Clear entire Keychain of app items
security find-generic-password -s "BlackBolt" \
  ~/Library/Keychains/login.keychain-db | \
  while read -r line; do
    security delete-generic-password -a "$line" \
      ~/Library/Keychains/login.keychain-db
  done
```

### Cache Cleanup

**Remove Cached Files**:
```bash
# Clear cache
rm -rf ~/Library/Caches/BlackBoltOperator

# Clear temporary files
rm -rf /tmp/BlackBoltOperator-*
rm -rf /var/tmp/BlackBoltOperator-*

# Clear download cache
rm -rf ~/Library/Saved\ Application\ State/com.blackbolt.operator.savedState
```

## Troubleshooting Deployment

### App Won't Launch

**Symptom**: Double-clicking app does nothing

**Solutions**:

```bash
# Try command line launch
/Applications/BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator

# Check if app is actually running
ps aux | grep BlackBolt

# Check error logs
log show --predicate 'process == "BlackBoltOperator"' --last 1h

# Verify executable permission
chmod +x /Applications/BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator

# Verify code signature
codesign -v /Applications/BlackBoltOperator.app
```

### Permission Errors

**Symptom**: "Permission denied" when launching

**Solutions**:

```bash
# Make executable
chmod +x /Applications/BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator

# Check current permissions
ls -la /Applications/BlackBoltOperator.app/Contents/MacOS/BlackBoltOperator

# Repair code signature if needed
codesign -s - --options runtime /Applications/BlackBoltOperator.app
```

### Configuration Issues

**Symptom**: App shows "Invalid configuration"

**Solutions**:

```bash
# Reset configuration
rm -rf ~/Library/Application\ Support/BlackBoltOperator

# Restart app to reconfigure
open -a BlackBoltOperator

# Or provide via environment variables
export API_BASE_URL=https://api.example.com:8443
export OPERATOR_KEY=your-key-here
export TENANT_ID=your-tenant
open -a BlackBoltOperator
```

## Monitoring After Deployment

### System Log Monitoring

**View Application Logs**:
```bash
# Last hour of logs
log show --predicate 'process == "BlackBoltOperator"' --last 1h

# Continuous log stream
log stream --predicate 'process == "BlackBoltOperator"' --level info

# Filter for errors
log show --predicate 'process == "BlackBoltOperator" AND level == error'
```

### Error Reporting

**Built-in Error Reporting**:
```
1. If app encounters error
2. Error dialog appears
3. User can click "Report Error"
4. Error sent to developers (if enabled)
```

### Performance Metrics

**Monitor Memory Usage**:
```bash
# Check memory
ps aux | grep BlackBoltOperator | grep -v grep

# Sample memory usage
sample BlackBoltOperator -file sample.txt

# Analyze with Instruments
open -a Instruments
```

**Monitor Disk Usage**:
```bash
# Check cache size
du -h ~/Library/Application\ Support/BlackBoltOperator

# Check logs size
du -h ~/Library/Logs/BlackBoltOperator

# If exceeding quota, rotate logs
rm -rf ~/Library/Logs/BlackBoltOperator/old-*.log
```

### Security Alerts

**Monitor for Security Issues**:
```bash
# Check security events
log show --predicate 'process == "BlackBoltOperator" AND message CONTAINS "security"'

# Monitor code signature status
codesign -v /Applications/BlackBoltOperator.app

# Check keychain access logs
log show --predicate 'sender == "Security"' --last 1h
```

## Disaster Recovery

### Credential Recovery

**If Credentials Lost**:

```bash
# Check Keychain recovery
security find-generic-password -a "operator_key" \
  ~/Library/Keychains/login.keychain-db

# If not found, must reconfigure:
1. Open app settings
2. Re-enter operator key
3. Verify connectivity

# Create backup of credentials
security export-identity -t certs -f pkcs12 \
  -o credentials-backup.p12
```

### Configuration Recovery

**From Backup**:

```bash
# Restore configuration backup
cp ~/Library/Application\ Support/BlackBoltOperator-backup/* \
   ~/Library/Application\ Support/BlackBoltOperator/

# Restart app
killall BlackBoltOperator
sleep 2
open -a BlackBoltOperator
```

**From Previous Version**:

```bash
# Install previous release
curl -L -o BlackBoltOperator-1.0.0.zip \
  https://github.com/yourorg/BlackBoltOperator/releases/download/v1.0.0/BlackBoltOperator-1.0.0.zip

# Extract and install
unzip BlackBoltOperator-1.0.0.zip
cp -r BlackBoltOperator.app /Applications/BlackBoltOperator-backup.app

# Configuration should still work with older version
```

### Rollback Procedure

**If Update Causes Issues**:

```bash
# 1. Stop current version
killall BlackBoltOperator

# 2. Remove problematic version
rm -rf /Applications/BlackBoltOperator.app

# 3. Install previous version
cd ~/Downloads
unzip BlackBoltOperator-1.0.0.zip
cp -r BlackBoltOperator.app /Applications/

# 4. Verify working state
open -a BlackBoltOperator

# 5. Check logs for errors
log show --predicate 'process == "BlackBoltOperator"' --last 1h
```

---

This deployment guide provides comprehensive instructions for users installing and managing BlackBolt Operator. For developer information, see SWIFT_DEVELOPMENT_GUIDE.md. For build and release procedures, see SWIFT_BUILD_AND_RELEASE.md.
