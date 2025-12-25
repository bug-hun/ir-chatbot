/**
 * PowerShell Service
 * Handles local and remote PowerShell execution via WinRM
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class PowerShellService {
    constructor() {
        this.credentials = {
            username: process.env.IR_USERNAME,
            password: process.env.IR_PASSWORD
        };
        this.timeout = parseInt(process.env.COMMAND_TIMEOUT) || 300000; // 5 minutes default
        this.targetsConfig = this.loadTargetsConfig();
    }

    /**
     * Load targets configuration from JSON file
     */
    loadTargetsConfig() {
        try {
            const configPath = path.join(__dirname, '../config/targets.json');
            const data = fsSync.readFileSync(configPath, 'utf8');
            const config = JSON.parse(data);
            logger.info('Loaded targets config', {
                targetCount: Object.keys(config.targets || {}).length,
                aliasCount: Object.keys(config.aliases || {}).length,
                aliases: Object.keys(config.aliases || {})
            });
            return config;
        } catch (error) {
            logger.warn('Could not load targets.json, alias resolution disabled', { error: error.message });
            return { targets: {}, aliases: {} };
        }
    }

    /**
     * Resolve target name/alias to IP address
     * @param {string} target - Target name, alias, or IP address
     * @returns {string} - Resolved IP address
     */
    resolveTarget(target) {
        // Check if it's already an IP address (simple check)
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target)) {
            logger.debug('Target is already an IP', { target });
            return target;
        }

        // Check if it's an alias
        if (this.targetsConfig.aliases && this.targetsConfig.aliases[target.toLowerCase()]) {
            const targetName = this.targetsConfig.aliases[target.toLowerCase()];
            logger.debug('Resolved alias to target name', { alias: target, targetName });
            target = targetName;
        }

        // Check if it's a target name
        if (this.targetsConfig.targets && this.targetsConfig.targets[target]) {
            const ip = this.targetsConfig.targets[target].ip;
            logger.info('Resolved target name to IP', { targetName: target, ip });
            return ip;
        }

        // If nothing matched, return original (might be a hostname)
        logger.debug('Target not found in config, using as-is', { target });
        return target;
    }

    /**
     * Execute PowerShell script on remote machine via WinRM
     * @param {string} target - Target hostname or IP address
     * @param {string} scriptPath - Path to the PowerShell script
     * @param {object} params - Parameters to pass to the script
     * @returns {Promise<object>} - Script execution result
     */
    async executeRemoteScript(target, scriptPath, params = {}) {
        // Resolve target name/alias to IP
        const resolvedTarget = this.resolveTarget(target);
        logger.info('Executing remote script', { originalTarget: target, resolvedTarget, scriptPath, params: Object.keys(params) });

        // Read the script content
        const absolutePath = path.resolve(scriptPath);
        let scriptContent;

        try {
            scriptContent = await fs.readFile(absolutePath, 'utf8');
        } catch (error) {
            logger.error('Failed to read script file', { scriptPath: absolutePath, error: error.message });
            throw new Error(`Script file not found: ${scriptPath}`);
        }

        // Escape password for PowerShell
        const escapedPassword = this.credentials.password.replace(/'/g, "''");

        // Build parameter string for PowerShell
        const paramDeclarations = Object.entries(params)
            .map(([key, value]) => {
                if (typeof value === 'boolean') {
                    return `$${key} = $${value}`;
                } else if (Array.isArray(value)) {
                    return `$${key} = @('${value.join("','")}')`;
                } else if (typeof value === 'number') {
                    return `$${key} = ${value}`;
                } else {
                    return `$${key} = '${String(value).replace(/'/g, "''")}'`;
                }
            })
            .join('; ');

        // Construct the remote execution command
        const psCommand = `
            $ErrorActionPreference = 'Stop'

            # Create credential object
            $securePassword = ConvertTo-SecureString '${escapedPassword}' -AsPlainText -Force
            $credential = New-Object System.Management.Automation.PSCredential('${this.credentials.username}', $securePassword)

            try {
                # Execute script remotely
                $result = Invoke-Command -ComputerName '${resolvedTarget}' -Credential $credential -ScriptBlock {
                    ${paramDeclarations}

                    ${scriptContent}
                }

                # Return success result
                @{
                    Success = $true
                    Data = $result
                } | ConvertTo-Json -Depth 10 -Compress

            } catch {
                # Return error result
                @{
                    Success = $false
                    Error = $_.Exception.Message
                    Details = $_.Exception.ToString()
                } | ConvertTo-Json -Compress
            }
        `;

        return this.execute(psCommand);
    }

    /**
     * Execute local PowerShell command
     * @param {string} command - PowerShell command to execute
     * @returns {Promise<object>} - Command execution result
     */
    execute(command) {
        return new Promise((resolve, reject) => {
            const args = [
                '-ExecutionPolicy', 'Bypass',
                '-NoProfile',
                '-NonInteractive',
                '-Command', command
            ];

            logger.debug('Spawning PowerShell process');

            const ps = spawn('powershell.exe', args, {
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            // Timeout handler
            const timer = setTimeout(() => {
                ps.kill('SIGTERM');
                reject(new Error(`Execution timed out after ${this.timeout}ms`));
            }, this.timeout);

            ps.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            ps.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ps.on('close', (code) => {
                clearTimeout(timer);

                logger.debug('PowerShell process completed', { code, stdoutLength: stdout.length, stderrLength: stderr.length });

                try {
                    // Try to parse JSON output
                    const trimmedOutput = stdout.trim();

                    if (!trimmedOutput) {
                        if (code === 0) {
                            resolve({ Success: true, Data: null });
                        } else {
                            reject(new Error(stderr || `PowerShell exited with code ${code}`));
                        }
                        return;
                    }

                    // Find JSON in output (may have other text before/after)
                    const jsonMatch = trimmedOutput.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const result = JSON.parse(jsonMatch[0]);

                        if (result.Success) {
                            let data = result.Data;

                            // Unwrap Invoke-Command wrapper: {value, PSComputerName, RunspaceId}
                            // May need multiple passes if deeply nested
                            while (data && typeof data === 'object' && data.value !== undefined && data.PSComputerName !== undefined) {
                                logger.debug('Unwrapping Invoke-Command result', { PSComputerName: data.PSComputerName });
                                data = data.value;
                            }

                            // Parse JSON string (may need multiple passes for double-encoded JSON)
                            while (typeof data === 'string') {
                                const trimmed = data.trim();
                                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                                    try {
                                        const parsed = JSON.parse(trimmed);
                                        logger.debug('Parsed JSON string');
                                        data = parsed;
                                    } catch (e) {
                                        break; // Not valid JSON, keep as string
                                    }
                                } else {
                                    break; // Not JSON format
                                }
                            }

                            resolve(data);
                        } else {
                            reject(new Error(result.Error || 'Unknown error'));
                        }
                    } else {
                        // No JSON found, treat raw output as result
                        if (code === 0) {
                            resolve(trimmedOutput);
                        } else {
                            reject(new Error(stderr || trimmedOutput || `Exit code ${code}`));
                        }
                    }
                } catch (parseError) {
                    logger.warn('Failed to parse PowerShell output as JSON', {
                        error: parseError.message,
                        stdout: stdout.substring(0, 500)
                    });

                    if (code === 0) {
                        resolve(stdout.trim());
                    } else {
                        reject(new Error(stderr || stdout || `Exit code ${code}`));
                    }
                }
            });

            ps.on('error', (err) => {
                clearTimeout(timer);
                logger.error('PowerShell spawn error', { error: err.message });
                reject(err);
            });
        });
    }

    /**
     * Execute a simple local PowerShell command and return output
     * @param {string} command - PowerShell command
     * @returns {Promise<string>} - Command output
     */
    async executeSimple(command) {
        const wrappedCommand = `
            try {
                ${command}
            } catch {
                Write-Error $_.Exception.Message
                exit 1
            }
        `;
        return this.execute(wrappedCommand);
    }

    /**
     * Test connectivity to a remote host
     * @param {string} target - Target hostname or IP
     * @returns {Promise<boolean>} - True if reachable
     */
    async testConnection(target) {
        try {
            await this.executeSimple(`Test-WSMan '${target}' -ErrorAction Stop`);
            return true;
        } catch (error) {
            logger.warn('Connection test failed', { target, error: error.message });
            return false;
        }
    }

    /**
     * Get quick system status (without full script)
     * @param {string} target - Target hostname or IP
     * @returns {Promise<object>} - Basic system info
     */
    async getQuickStatus(target) {
        const escapedPassword = this.credentials.password.replace(/'/g, "''");

        const command = `
            $securePassword = ConvertTo-SecureString '${escapedPassword}' -AsPlainText -Force
            $credential = New-Object System.Management.Automation.PSCredential('${this.credentials.username}', $securePassword)

            Invoke-Command -ComputerName '${target}' -Credential $credential -ScriptBlock {
                @{
                    Hostname = $env:COMPUTERNAME
                    OS = (Get-CimInstance Win32_OperatingSystem).Caption
                    Uptime = (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
                    ProcessCount = (Get-Process).Count
                    ConnectionCount = (Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue).Count
                }
            } | ConvertTo-Json
        `;

        return this.execute(command);
    }
}

module.exports = { PowerShellService };
