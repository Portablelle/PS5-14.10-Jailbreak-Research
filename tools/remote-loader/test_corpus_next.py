"""Corpus resume endpoint tests: /corpus-next scans host-beacons.log for GAP-i."""

import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest import mock

import host


class CorpusNextTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="ps5-corpus-test-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.log = self.root / "host-beacons.log"
        (self.root / "index.html").write_bytes(b"corpus fixture")
        for patch in (
            mock.patch.object(host, "REPO_ROOT", str(self.root)),
            mock.patch.object(host, "say"),
            mock.patch.object(host, "get_embedded_zip", return_value=None),
        ):
            patch.start()
            self.addCleanup(patch.stop)
        self.server = host.build_server(
            "127.0.0.1", 0, host.DEFAULT_TARGET, host.Status(enabled=False), True
        )
        self.thread = threading.Thread(
            target=self.server.serve_forever, kwargs={"poll_interval": 0.01}
        )
        self.thread.start()
        self.addCleanup(self.stop_server)

    def stop_server(self):
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()

    def get(self, path):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        try:
            connection.request("GET", path, headers={"Host": host.DEFAULT_TARGET})
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def write_log(self, paths):
        with self.log.open("w", encoding="utf-8") as fh:
            for p in paths:
                fh.write(json.dumps({"t": "00:00:00", "path": p, "ua": "-", "body": "", "origin": "127.0.0.1"}) + "\n")

    def test_no_log_means_start(self):
        status, payload = self.get("/corpus-next")
        self.assertEqual(status, 200)
        self.assertEqual(payload["next"], 0)

    def test_resume_after_highest_gap(self):
        self.write_log([
            "/beacon/VCORP-abc1-BEFORE-0?t=1&n=1",
            "/beacon/VCORP-abc1-OK-0-x.html?t=2&n=2",
            "/beacon/VCORP-abc1-GAP-0?t=3&n=3",
            "/beacon/VCORP-abc1-GAP-1?t=4&n=4",
            "/beacon/VCORP-abc2-BEFORE-2?t=5&n=1",  # crashed mid-case: no GAP-2
        ])
        status, payload = self.get("/corpus-next")
        self.assertEqual(status, 200)
        self.assertEqual(payload["next"], 2)

    def test_out_of_order_and_malformed_lines(self):
        self.write_log([
            "/beacon/VCORP-a-GAP-7?t=1&n=1",
            "not json at all",
            "/beacon/VCORP-a-GAP-3?t=2&n=2",
        ])
        status, payload = self.get("/corpus-next")
        self.assertEqual(status, 200)
        self.assertEqual(payload["next"], 8)


if __name__ == "__main__":
    unittest.main()
