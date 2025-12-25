require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PowerShellService } = require('./src/services/powershellService');

async function testDownload() {
    const ps = new PowerShellService();

    console.log('=== Test File Download ===\n');

    // Step 1: Collect logs
    console.log('1. Collecting logs from vm1...');
    const result = await ps.executeRemoteScript('vm1', './src/scripts/Collect-Logs.ps1', { DaysBack: 1 });
    console.log('   Remote:', result.Path);
    console.log('   Size:', result.Size);
    console.log('   Events:', result.EventCount);

    // Step 2: Download
    console.log('\n2. Downloading to local folder...');
    const logsFolder = path.join(__dirname, 'collected-logs');
    const localPath = path.join(logsFolder, 'TEST_' + path.basename(result.Path));

    const escapedPw = process.env.IR_PASSWORD.replace(/'/g, "''");
    const cmd = `
        $pw = ConvertTo-SecureString '${escapedPw}' -AsPlainText -Force
        $cred = New-Object PSCredential('${process.env.IR_USERNAME}', $pw)
        $s = New-PSSession -ComputerName '192.168.1.33' -Credential $cred
        Copy-Item -Path '${result.Path}' -Destination '${localPath.replace(/\\/g, '\\\\')}' -FromSession $s
        Remove-PSSession $s
    `;

    await ps.execute(cmd);

    // Step 3: Verify
    console.log('\n3. Verifying...');
    if (fs.existsSync(localPath)) {
        const size = (fs.statSync(localPath).size / 1024 / 1024).toFixed(2);
        console.log('   SUCCESS! Downloaded to:', localPath);
        console.log('   File size:', size, 'MB');
    } else {
        console.log('   FAIL: File not found at', localPath);
    }

    // List all files
    console.log('\n4. All files in collected-logs:');
    const files = fs.readdirSync(logsFolder).filter(f => f.endsWith('.zip'));
    files.forEach(f => {
        const s = fs.statSync(path.join(logsFolder, f));
        console.log('   -', f, '(' + (s.size/1024/1024).toFixed(2) + ' MB)');
    });
}

testDownload().catch(e => console.error('Error:', e.message));
