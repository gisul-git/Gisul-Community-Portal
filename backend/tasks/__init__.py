"""Tasks module - Celery tasks and worker configuration"""
from .celery_app import cel
from .tasks import bulk_import_task

__all__ = ['cel', 'bulk_import_task']
