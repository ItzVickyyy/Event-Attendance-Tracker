#!/usr/bin/env python3
"""
Phase 3C-1 FINAL VERIFICATION

This script performs a strict final verification of Phase 3C-1.
It does NOT use any PowerShell-specific syntax.
"""

import os
import sys
import subprocess

def run_cmd(cmd):
    """Run a command and return (exit_code, stdout, stderr)"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, "", str(e)

def main():
    print("=" * 70)
    print("PHASE 3C-1 FINAL VERIFICATION - STRICT")
    print("=" * 70)

    # STEP 1: GIT STATE
    print("\\n1. GIT STATE CHECK")
    print("-" * 70)
    
    # Get git status
    code, out, err = run_cmd("git status --short")
    if out:
        lines = out.strip().split("\\n")
        print(f"Uncommitted changes: {len(lines)}")
        for line in lines:
            print(f"  {line}")
    else:
        print("No uncommitted changes")
    
    # Get HEAD history
    print("\\nHEAD history (last 5 commits):")
    run_cmd("git log --oneline -5")
    
    # STEP 2: SUPPORTING MODIFICATIONS REVIEW
    print("\\n2. SUPPORTING MODIFICATIONS REVIEW")
    print("-" * 70)
    
    # Review app/core/db.py
    print("\\n2.1 Review app/core/db.py")
    if os.path.exists("app/core/db.py"):
        with open("app/core/db.py", "r") as f:
            current_db = f.read()
        
        # Get HEAD version
        code, head_db, _ = run_cmd("git show HEAD:app/core/db.py")
        if code == 0:
            if current_db != head_db:
                print("  CHANGES DETECTED: db.py was modified from HEAD")
                print("  New content (first 20 lines):")
                lines = current_db.split("\\n")
                for i, line in enumerate(lines[:20]):
                    if line.strip():
                        print(f"    Line {i+1}: {line}")
                
                # Check for migration bypass
                if "SQLModel.metadata.create_all(engine)" in current_db:
                    print("  \n  ⚠️  SECURITY RISK: db.py contains SQLModel.metadata.create_all()")
                    print("      This BYPASSES migrations - VIOLATION")
                    print("      Project expects migration-first architecture")
            else:
                print("  No changes - db.py matches HEAD")
        else:
            print("  Could not read HEAD version")
    else:
        print("  File app/core/db.py not found")
    
    # Review tests/conftest.py
    print("\\n2.2 Review tests/conftest.py")
    if os.path.exists("tests/conftest.py"):
        with open("tests/conftest.py", "r") as f:
            conftest_content = f.read()
        
        if "def db_session(db: Session)" in conftest_content:
            print("  db_session fixture present")
            if "return db" in conftest_content:
                print("  - db_session is a simple alias - acceptable for test compatibility")
            else:
                print("  - WARNING: db_session fixture may not be just an alias")
    
    # Review alembic migration
    print("\\n2.3 Review app/alembic/versions/b0e1d2c3f4a5_add_academic_status_to_students.py")
    if os.path.exists("app/alembic/versions/b0e1d2c3f4a5_add_academic_status_to_students.py"):
        with open("app/alembic/versions/b0e1d2c3f4a5_add_academic_status_to_students.py", "r") as f:
            migration = f.read()
        
        if "Create Date: 2026-09-19 23:26:04.1" in migration:
            print("  TIMESTAMP: Valid format")
        else:
            print("  TIMESTAMP: INVALID format")
            lines = migration.split("\\n")
            for i, line in enumerate(lines):
                if "Create Date:" in line:
                    print(f"    Line {i+1}: {line.strip()}")
    
    # STEP 3: IMPLEMENTATION CHECK
    print("\\n3. PHASE 3C-1 IMPLEMENTATION CHECK")
    print("-" * 70)
    
    required_components = [
        ("app/services/student_import.py", "XLSX parser class exists"),
        ("app/services/__init__.py", "exports StudentImportService"),
        ("tests/crud/test_student_import.py", "test file exists"),
    ]
    
    for filepath, description in required_components:
        if os.path.exists(filepath):
            print(f"  ✅ {filepath}: {description}")
        else:
            print(f"  ❌ {filepath}: MISSING - {description}")
    
    # STEP 4: RUNNING FOCUSED TESTS
    print("\\n4. RUNNING FOCUSED TESTS")
    print("-" * 70)
    print("  Executing: uv run pytest tests/crud/test_student_import.py -q")
    
    result = subprocess.run(
        ["uv", "run", "pytest", "tests/crud/test_student_import.py", "-q"],
        capture_output=True,
        text=True,
        timeout=300
    )
    
    print(f"  Exit Code: {result.returncode}")
    print("\\n=== TEST OUTPUT ===")
    if result.stdout:
        print(result.stdout)
    
    # Determine status
    has_actual_failures = result.returncode != 0
    has_actual_skipped = "skipped" in (result.stdout or "").lower()
    
    if result.returncode == 0:
        status = "VERIFIED COMPLETE"
        status_color = "✅"
    elif has_actual_failures:
        status = "FAILED - IMPLEMENTATION"
        status_color = "❌"
    else:
        status = "IMPLEMENTED BUT UNVERIFIED"
        status_color = "⚠️"
    
    print(f"\\nFINAL STATUS: {status_color} {status}")
    
    # STEP 5: SHOW SUMMARY
    print("\\n" + "=" * 70)
    print("VERIFICATION SUMMARY")
    print("=" * 70)
    print(f"Git status: {len(open('git_status.txt', 'w').write(out) if 'out' in locals() else '0')} uncommitted changes")
    print(f"Test result: {result.returncode} (0=success)")
    print(f"Status: {status}")
    
    if has_actual_failures:
        print("\\nWARNING: Implementation failures detected")
        print("Review failures and consider fixing Phase 3C-1 defects")
    elif result.returncode == 0:
        print("\\nSUCCESS: Phase 3C-1 implementation appears correct and tests pass")
    
    return result.returncode if result.returncode == 0 else 1

if __name__ == "__main__":
    sys.exit(main())