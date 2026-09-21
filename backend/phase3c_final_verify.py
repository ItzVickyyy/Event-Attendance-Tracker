#!/usr/bin/env python3
"""
Final verification script for Phase 3C-1
This script performs a comprehensive verification of the Phase 3C-1 implementation.
It checks git status, reviews changes, verifies the implementation, and runs tests.
"""

import os
import sys
import subprocess

def run_cmd(cmd):
    """Run a command and return exit code, stdout, stderr"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, "", str(e)

def main():
    print("=" * 80)
    print("PHASE 3C-1 FINAL VERIFICATION")
    print("=" * 80)
    
    # STEP 1: GIT STATUS
    print("\n1. GIT STATUS CHECK")
    print("-" * 80)
    
    code, out, err = run_cmd("git status --short")
    if code == 0:
        changes = out.strip().split("\n") if out else []
        print(f"Uncommitted changes: {len(changes)}")
        for change in changes:
            if change:
                print(f"  {change}")
    else:
        print(f"Could not get git status: {err}")
    
    # Get HEAD history
    print("\nHEAD history (last 5 commits):")
    run_cmd("git log --oneline -5")
    
    # STEP 2: REVIEW SUPPORTING MODIFICATIONS
    print("\n2. SUPPORTING MODIFICATIONS REVIEW")
    print("-" * 80)
    
    # Review app/core/db.py
    print("\n2.1 Review app/core/db.py")
    if os.path.exists("app/core/db.py"):
        with open("app/core/db.py", "r") as f:
            current_db = f.read()
        
        # Get HEAD version
        code, head_db, _ = run_cmd("git show HEAD:app/core/db.py")
        if code == 0:
            if current_db != head_db:
                print("  CHANGES DETECTED from HEAD")
                if "SQLModel.metadata.create_all(engine)" in current_db:
                    print("  ⚠️  SECURITY RISK: Contains migration bypass")
                    print("      This violates project architecture - EXPECTATION MISMATCH")
                else:
                    print("  Other changes")
            else:
                print("  No changes - matches HEAD")
        else:
            print("  Could not read HEAD version")
    else:
        print("  File app/core/db.py not found")
    
    # Review tests/conftest.py
    print("\n2.2 Review tests/conftest.py")
    if os.path.exists("tests/conftest.py"):
        with open("tests/conftest.py", "r") as f:
            conftest_content = f.read()
        
        if "def db_session(db: Session)" in conftest_content:
            print("  db_session fixture present")
            if "return db" in conftest_content:
                print("  - Simple alias - acceptable for test compatibility")
            else:
                print("  - WARNING: Not a simple alias")
    
    # Review alembic migration
    print("\n2.3 Review alembic migration")
    if os.path.exists("app/alembic/versions/b0e1d2c3f4a5_add_academic_status_to_students.py"):
        with open("app/alembic/versions/b0e1d2c3f4a5_add_academic_status_to_students.py", "r") as f:
            migration = f.read()
        
        if "Create Date: 2026-09-19 23:26:04.1" in migration:
            print("  TIMESTAMP: Valid format")
        else:
            print("  TIMESTAMP: INVALID format")
            lines = migration.split("\n")
            for i, line in enumerate(lines):
                if "Create Date:" in line:
                    print(f"    Line {i+1}: {line.strip()}")
    
    # STEP 3: IMPLEMENTATION CHECK
    print("\n3. PHASE 3C-1 IMPLEMENTATION CHECK")
    print("-" * 80)
    print("  Checking Phase 3C-1 implementation requirements...")
    
    required_files = [
        ("app/services/student_import.py", "XLSX parser implementation"),
        ("app/services/__init__.py", "exports StudentImportService"),
        ("tests/crud/test_student_import.py", "Phase 3C-1 tests"),
    ]
    
    all_implementation_ok = True
    for filepath, description in required_files:
        if os.path.exists(filepath):
            print(f"  ✅ {filepath}: {description}")
        else:
            print(f"  ❌ {filepath}: {description}")
            all_implementation_ok = False
    
    # STEP 4: RUN FOCUSED TESTS
    print("\n4. RUNNING FOCUSED TESTS")
    print("-" * 80)
    print("  Executing: uv run pytest tests/crud/test_student_import.py -q")
    
    result = subprocess.run(
        ["uv", "run", "pytest", "tests/crud/test_student_import.py", "-q"],
        capture_output=True,
        text=True,
        timeout=300
    )
    
    print(f"  Exit Code: {result.returncode}")
    
    # Print a summary of the test output
    if result.stdout:
        lines = result.stdout.strip().split("\n")
        if lines:
            print("  Test output summary:")
            for line in lines:
                if line.strip():
                    print(f"   {line}")
    
    if result.stderr and "error" in result.stderr.lower():
        print("\n  ERRORS:")
        print(result.stderr[:500] if len(result.stderr) > 500 else result.stderr)
    
    # Determine final status
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
    
    print(f"\nFINAL STATUS: {status_color} {status}")
    
    # STEP 5: FINAL SUMMARY
    print("\n" + "=" * 80)
    print("FINAL VERIFICATION SUMMARY")
    print("=" * 80)
    print(f"Test execution result: {result.returncode} (0=success)")
    print(f"Status: {status}")
    
    if has_actual_failures:
        print("\n⚠️  IMPLEMENTATION ISSUES DETECTED")
        print("   The Phase 3C-1 implementation has functional problems")
        print("   that need to be fixed before it can be considered complete.")
    elif result.returncode == 0:
        print("\n✅ PHASE 3C-1 IMPLEMENTATION VERIFIED")
        print("   All tests pass successfully")
    else:
        print("\n❓ STATUS UNCLEAR")
        print("   Further investigation required")
    
    return result.returncode if result.returncode == 0 else 1

if __name__ == "__main__":
    sys.exit(main())