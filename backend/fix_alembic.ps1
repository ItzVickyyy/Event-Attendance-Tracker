# Fix the alembic version file syntax error
$content = Get-Content "app\alembic\versions\b0e1d2c3f4a5_add_academic_status_to_students.py"
$newContent = $content -replace "Create Date: 2026-09-19 23:26:04.100", "Create Date: 2026-09-19 23:26:04.1"
Set-Content "app\alembic\versions\b0e1d2c3f4a5_add_academic_status_to_students.py" $newContent
Write-Host "Alembic version file fixed successfully"
