import asyncio
import logging
import os
import signal
from bullmq import Worker
from .importer import XlsbImporter

async def process(job, _token):
    return await asyncio.to_thread(XlsbImporter().run, job.data["importId"], job.data["storageKey"])

async def main():
    worker = Worker("import-processing", process, {"connection": os.getenv("REDIS_URL", "redis://redis:6379"), "concurrency": 1})
    stopped = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM): loop.add_signal_handler(sig, stopped.set)
    logging.basicConfig(level=logging.INFO, format='{"level":"info","message":"%(message)s"}')
    logging.info("importer ready")
    await stopped.wait()
    await worker.close()

if __name__ == "__main__": asyncio.run(main())
