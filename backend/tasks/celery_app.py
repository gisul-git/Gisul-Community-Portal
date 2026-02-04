"""
Note:
For Windows development, Celery must use --pool=solo to avoid multiprocessing and eventlet issues.
For production (Linux/Docker), remove --pool=solo and use the default prefork pool for better performance.
"""

from celery import Celery
from celery.signals import worker_process_init, worker_ready, task_prerun, task_postrun, task_received
import os
from dotenv import load_dotenv
load_dotenv()

# Redis URL - use service name in Docker network (redis:6379) or env variable
# Docker compose sets REDIS_URL=redis://redis:6379/0
# For local dev: redis://localhost:6379/0
redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")  # Default to Docker service name

cel = Celery("ea_worker", broker=redis_url, backend=redis_url)

# Configure Celery to auto-discover tasks
# Windows development: use --pool=solo
# Production (Linux/Docker): use default prefork pool with --concurrency=4
cel.conf.task_track_started = True
cel.conf.broker_connection_retry_on_startup = True
cel.conf.task_always_eager = False  # Ensure tasks run in background
cel.conf.task_acks_late = True  # Acknowledge tasks after completion
cel.conf.task_reject_on_worker_lost = True  # Reject tasks if worker dies

# Auto-discover tasks from the 'tasks.tasks' module
# This tells Celery which modules to import when the worker starts
cel.conf.imports = ('tasks.tasks',)

# Logging configuration
cel.conf.worker_log_format = "[%(asctime)s: %(levelname)s/%(processName)s] %(message)s"
cel.conf.worker_task_log_format = "[%(asctime)s: %(levelname)s/%(processName)s][%(task_name)s(%(task_id)s)] %(message)s"

# Import tasks to ensure they're registered when celery_app is imported
# This ensures the tasks are available when the worker starts
# NOTE: This import must happen AFTER cel is created but BEFORE worker starts
def register_tasks():
    """Explicitly register tasks module"""
    try:
        from tasks import tasks  # This will register all tasks decorated with @cel.task
        print("✅ Tasks module imported and registered successfully")
        print(f"   Registered tasks: {[k for k in cel.tasks.keys() if not k.startswith('celery.')]}")
        return True
    except Exception as e:
        print(f"⚠️  Warning: Could not import tasks module: {e}")
        import traceback
        traceback.print_exc()
        return False

# Auto-register tasks on import
register_tasks()

@worker_process_init.connect
def cleanup_on_worker_start(sender=None, **kwargs):
    """Clean up any lingering threads and resources when Celery worker process starts"""
    import threading
    import gc
    
    print("🧹 Cleaning up threads and resources on worker startup...")
    
    active_threads = threading.active_count()
    print(f"   Active threads before cleanup: {active_threads}")
    
    gc.collect()
    
    print(f"   Active threads after cleanup: {threading.active_count()}")

@worker_ready.connect
def cleanup_on_worker_ready(sender=None, **kwargs):
    """Cancel all pending tasks and purge queue when Celery worker is ready"""
    # Only purge on startup if explicitly enabled via environment variable
    # This prevents purging tasks that are queued while worker is starting
    purge_on_startup = os.getenv("CELERY_PURGE_ON_STARTUP", "false").lower() == "true"
    
    if not purge_on_startup:
        print("ℹ️ Skipping queue purge on startup (set CELERY_PURGE_ON_STARTUP=true to enable)")
        return
    
    print("🔄 Cleaning up pending tasks and queue on worker ready...")
    
    try:
        print("🗑️ Purging all pending tasks from queue...")
        from celery import current_app
        
        purged = current_app.control.purge()
        if purged:
            if isinstance(purged, dict):
                purged_count = sum(purged.values())
            else:
                purged_count = int(purged)
            print(f"   ✅ Purged {purged_count} pending task(s) from queue")
        else:
            print("   ✅ No pending tasks in queue to purge")
            
    except Exception as e:
        print(f"   ⚠️ Error purging queue: {e}")
        try:
            import traceback
            traceback.print_exc()
        except:
            pass
    
    try:
        print("🔄 Revoking all active tasks...")
        from celery import current_app
        inspector = current_app.control.inspect()
        
        active_tasks = inspector.active()
        scheduled_tasks = inspector.scheduled()
        reserved_tasks = inspector.reserved()
        
        revoked_count = 0
        if active_tasks:
            for worker, tasks in active_tasks.items():
                for task in tasks:
                    try:
                        task_id = task.get('id')
                        if task_id:
                            current_app.control.revoke(task_id, terminate=True)
                            revoked_count += 1
                            print(f"   Revoked active task: {task_id}")
                    except Exception as e:
                        print(f"   ⚠️ Error revoking task: {e}")
        
        if scheduled_tasks:
            for worker, tasks in scheduled_tasks.items():
                for task in tasks:
                    try:
                        task_id = task.get('request', {}).get('id')
                        if task_id:
                            current_app.control.revoke(task_id, terminate=True)
                            revoked_count += 1
                            print(f"   Revoked scheduled task: {task_id}")
                    except Exception as e:
                        print(f"   ⚠️ Error revoking scheduled task: {e}")
        
        if reserved_tasks:
            for worker, tasks in reserved_tasks.items():
                for task in tasks:
                    try:
                        task_id = task.get('id')
                        if task_id:
                            current_app.control.revoke(task_id, terminate=True)
                            revoked_count += 1
                            print(f"   Revoked reserved task: {task_id}")
                    except Exception as e:
                        print(f"   ⚠️ Error revoking reserved task: {e}")
        
        if revoked_count > 0:
            print(f"   ✅ Revoked {revoked_count} active task(s)")
        else:
            print("   ✅ No active tasks to revoke")
            
    except Exception as e:
        print(f"   ⚠️ Error during task revocation: {e}")
        try:
            import traceback
            traceback.print_exc()
        except:
            pass
    
    print("✅ Worker ready cleanup completed")

@task_received.connect
def on_task_received(sender=None, **kwargs):
    """Log when a task is received by the worker"""
    try:
        request = kwargs.get('request', {})
        task_id = request.get('id', 'unknown')
        task_name = request.get('task', 'unknown')
        print(f"📥 Task received: {task_name} (ID: {task_id})")
    except Exception as e:
        print(f"⚠️ Error in task_received handler: {e}")

@task_prerun.connect
def cleanup_before_task(sender=None, **kwargs):
    """Clean up before each task runs and log task start"""
    import threading
    import gc
    import logging
    
    try:
        task_id = kwargs.get('task_id', 'unknown')
        task_name = kwargs.get('task', {}).__name__ if hasattr(kwargs.get('task'), '__name__') else 'unknown'
        print(f"▶️ Task starting: {task_name} (ID: {task_id})")
    except Exception as e:
        print(f"⚠️ Error logging task start: {e}")
    
    gc.collect()
    
    active_threads = threading.active_count()
    if active_threads > 10:
        logger = logging.getLogger(__name__)
        logger.warning(f"⚠️ High thread count before task: {active_threads}")

@task_postrun.connect
def cleanup_after_task(sender=None, **kwargs):
    """Clean up after each task completes and log task completion"""
    import gc
    
    try:
        task_id = kwargs.get('task_id', 'unknown')
        task_name = kwargs.get('task', {}).__name__ if hasattr(kwargs.get('task'), '__name__') else 'unknown'
        state = kwargs.get('state', 'unknown')
        print(f"✅ Task completed: {task_name} (ID: {task_id}, State: {state})")
    except Exception as e:
        print(f"⚠️ Error logging task completion: {e}")
    
    gc.collect()