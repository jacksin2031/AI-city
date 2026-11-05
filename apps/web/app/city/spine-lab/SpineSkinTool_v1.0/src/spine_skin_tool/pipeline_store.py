"""M07 namespace of the existing event/lease store; never a second persistence layer."""
from functools import partial
from . import repair_store
directory=partial(repair_store.directory,kind='flow')
read=partial(repair_store.read,kind='flow')
commit=partial(repair_store.commit,kind='flow')
lease=partial(repair_store.lease,kind='flow')
cancel=partial(repair_store.cancel,kind='flow')
atomic=repair_store.atomic
