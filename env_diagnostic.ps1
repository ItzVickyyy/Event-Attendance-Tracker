# Environment Diagnostic Script for Stage 3C-1

# Store current directory for reference
$script_dir = Get-Location
Write-Host "Repository Root: $script_dir"

# Step 1: Check if .venv exists
if (Test-Path ".venv") {
    Write-Host "Found .venv directory"
    $venv_dir = Get-ChildItem ".venv" | Select-Object Name, LastWriteTime, Length
    Write-Host "Virtual environment details:"
    $venv_dir | Format-Table -AutoSize
}
else {
    Write-Host "No .venv directory found"
}

# Step 2: Check Python executable
Write-Host "\nPython Environment:"
try {
    $python_version = python --version 2>$null
    Write-Host "Python version: $python_version"
}
catch {
    Write-Host "ERROR: Python executable not found or not accessible"
    Write-Host "Path: $(Get-Command python -ErrorAction SilentlyContinue | Where-Object CommandType -eq Application | Select-Object -First 1).Source"
}

# Step 3: Check uv executable
Write-Host "\nUV Environment:"
try {
    $uv_version = uv --version
    Write-Host "UV version: $uv_version"
}
catch {
    Write-Host "ERROR: UV executable not found or not accessible"
    Write-Host "Check if uv is installed and available in PATH"
}

# Step 4: Check backend/pyproject.toml
Write-Host "\nProject Configuration:"
if (Test-Path "backend/pyproject.toml") {
    Write-Host "backend/pyproject.toml exists"
    $project_content = Get-Content "backend/pyproject.toml" | Select-Object -First 50
    Write-Host "Project snippet:"
    $project_content
}
else {
    Write-Host "ERROR: backend/pyproject.toml not found"
}

# Step 5: Check uv.lock
Write-Host "\nLock File:"
if (Test-Path "uv.lock") {
    Write-Host "uv.lock exists"
    $lock_info = Get-ChildItem "uv.lock" | Select-Object Name, Length, LastWriteTime
    Write-Host "Lock file details:"
    $lock_info | Format-Table -AutoSize
}
else {
    Write-Host "ERROR: uv.lock not found"
}

# Step 6: Try uv commands if available
Write-Host "\nUV Command Testing:"
if (Get-Command uv -ErrorAction SilentlyContinue) {
    Write-Host "UV executable available"
    try {
        $uv_tree = uv tree --depth 1 2>&1
        Write-Host "uv tree --depth 1 result:"
        Write-Host $uv_tree
    }
    catch {
        Write-Host "ERROR: uv tree command failed"
        Write-Host "Error: $($_.Exception.Message)"
    }
    
    try {
        $uv_check = uv lock --check 2>&350
        Write-Host "uv lock --check: $uv_check"
    }
    catch {
        Write-Host "ERROR: uv lock --check command failed"
    }
}
else {
    Write-Host "SKIP: UV executable not available"
}

# Step 7: Try uv run python if UV is available
Write-Host "\nUV Python Execution:", ""
if (Get-Command uv -ErrorAction SilentlyContinue) {
    try {
        $python_version = uv run python --version
        Write-Host "uv run python --version: $python_version"
    }
    catch {
        Write-Host "ERROR: uv run python --version failed"
    }
    
    try {
        $python_exe = uv run python -c "import sys; print('Python executable:', sys.executable)"
        Write-Host "uv run python executable check: $python_exe"
    }
    catch {
        Write-Host "ERROR: uv run python executable check failed"
    }
    
    try {
        $openpyxl_check = uv run python -c "import openpyxl; print('openpyxl version:', openpyxl.__version__)"
        Write-Host "openpyxl check: $openpyxl_check"
    }
    catch {
        Write-Host "ERROR: openpyxl import failed"
        Write-Host "This indicates openpyxl is not installed or available"
    }
}
else {
    Write-Host "SKIP: UV not available, skipping uv run tests"
}

Write-Host "\nDiagnostic Complete!"
