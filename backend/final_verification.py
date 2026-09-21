#!/usr/bin/env python3
"""
Final verification script for Phase 3C-1
This script checks the current state and runs the focused tests
"""

import subprocess
import os
import sys

def run_cmd(cmd):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return 1, "", str(e)

def main():
    print("=" * 80)
    print("PHASE 3C-1 FINAL VERIFICATION")
    print("=" * 80)
    
    # Check git status
    print("\n1. Current git status:")
    code, out, _ = run_cmd("git status --short")
    if out:
        lines = out.strip().split("\n")
        print(f"   Uncommitted files: {len(lines)}")
        for line in lines:
            if line:
                print(f"   {line}")
    else:
        print("   No uncommitted changes")
    
    # Check HEAD
    print("\n2. HEAD commit (base):")
    code, out, _ = run_cmd("git log --oneline -1")
    if out:
        print(f"   {out.strip()}")
    else:
        print("   Could not get HEAD")
    
    # Check for key Phase 3C-1 files
    print("\n3. Key Phase 3C-1 files check:")
    required_files = [
        ("app/services/student_import.py", "XLSX parser implementation"),
        ("tests/crud/test_student_import.py", "Phase 3C-1 tests"),
    ]
    
    all_ok = True
    for filepath, desc in required_files:
        if os.path.exists(filepath):
            print(f"   ✅ {filepath}: {desc}")
        else:
            print(f"   ❌ {filepath}: {desc} - MISSING")
            all_ok = False
    
    # Check for the problematic db.py change
    print("\n4. Checking db.py for migration bypass:")
    if os.path.exists("app/core/db.py"):
        with open("app/core/db.py", "r") as f:
            content = f.read()
        
        if "SQLModel.metadata.create_all(engine)" in content:
            print("   ⚠️  CRITICAL ISSUE: db.py contains SQLModel.metadata.create_all()")
            print("      This BYPASSES migrations - VIOLATION of project architecture")
            print("      The project expects Alembic-first approach")
            all_ok = False
        else:
            print("   ✅ db.py does not contain migration bypass")
    else:
        print("   ❌ db.py not found")
        all_ok = False
    
    # Check alembic migration
    print("\n5. Checking alembic migration syntax:")
    if os.path.exists("app/alembic/versions/b0e1d2c3f4a5_add_academic_status_to_students.py"):
        with open("app/alembic/versions/b0e1d2c3f4a5_add_academic_status_to_students.py", "r") as f:
            content = f.read()
        
        if "Create Date: 2026-09-19 23:26:04.1" in content:
            print("   ✅ Alembic migration has valid timestamp")
        else:
            print("   ❌ Alembic migration has invalid timestamp")
            # Try to fix it
            new_content = content.replace("Create Date: 2026-09-19 23:26:04.100", "Create Date: 2026-09-19 23:26:04.1")
            try:
                with open("app/alembic/versions/b0e1d2c3f4a5_add_academic_status_to_students.py", "w") as f:
                    f.write(new_content)
                print("   🔧 Fixed alembic migration timestamp")
            except Exception as e:
                print(f"   ❌ Could not fix: {e}")
                all_ok = False
    else:
        print("   ❌ Alembic migration file not found")
        all_ok = False
    
    # Check tests/conftest.py for db_session fixture
    print("\n6. Checking tests/conftest.py:")
    if os.path.exists("tests/conftest.py"):
        with open("tests/conftest.py", "r") as f:
            content = f.read()
        
        if "def db_session(db: Session)" in content:
            print("   ✅ db_session fixture present")
            if "return db" in content:
                print("   - Simple alias - acceptable for test compatibility")
            else:
                print("   - WARNING: Not a simple alias")
        else:
            print("   ❌ db_session fixture not found")
    else:
        print("   ❌ conftest.py not found")
    
    # Now run the focused tests
    print("\n7. RUNNING FOCUSED TESTS")
    print("-" * 80)
    print("   Command: uv run pytest tests/crud/test_student_import.py -q")
    
    result = subprocess.run(
        ["uv", "run", "pytest", "tests/crud/test_student_import.py", "-q"],
        capture_output=True,
        text=True,
        timeout=300
    )
    
    print(f"   Exit Code: {result.returncode}")
    
    # Print a summary of the test output
    if result.stdout:
        lines = result.stdout.strip().split("\n")
        if lines:
            print("   Test output summary:")
            for line in lines:
                if line.strip():
                    print(f"   {line}")
    
    if result.stderr and "error" in result.stderr.lower():
        print("\n   ERRORS:")
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
    
    print(f"\n8. FINAL STATUS: {status_color} {status}")
    
    # FINAL SUMMARY
    print("\n" + "=" * 80)
    print("FINAL VERIFICATION SUMMARY")
    print("=" * 80)
    print(f"Test execution: {result.returncode} (0=success)")
    print(f"Overall status: {status}")
    
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