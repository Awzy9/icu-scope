"""The deployable site must never contain internal pipeline state. Vercel serves every deployed file BEFORE applying rewrites,
so the only reliable protection is to exclude those files from the build output (scripts/build_public.js)."""
import json
import os
import shutil
import subprocess
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INTERNAL = ["archive.json", "ai_cache.json", "verification.json", "audit_log.jsonl", "discovery.json", "discovery_state.json", "discovery_status.json",
            "discovery_config.json", "reconciliation.json", "evidence_alerts.json", "evidence_run.json", "evidence_policy.json"]


class TestPublicBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which("node"):
            raise unittest.SkipTest("node not available")
        cls.proc = subprocess.run(["node", os.path.join(ROOT, "scripts", "build_public.js")], capture_output=True, text=True, cwd=ROOT)
        cls.out = os.path.join(ROOT, "public")

    def test_build_succeeds(self):
        self.assertEqual(self.proc.returncode, 0, self.proc.stderr)

    def test_no_internal_data_is_deployable(self):
        for name in INTERNAL:
            self.assertFalse(os.path.exists(os.path.join(self.out, "data", name)), f"{name} would be publicly served")
        self.assertFalse(os.path.exists(os.path.join(self.out, "data", "decisions")))
        self.assertEqual(sorted(os.listdir(os.path.join(self.out, "data"))), ["articles.json", "embeddings.json", "link_check.json", "spotlight.json"])

    def test_unknown_future_data_files_are_private_by_default(self):
        p = os.path.join(ROOT, "data", "zz_future_internal.json")
        open(p, "w").write("{}")
        try:
            subprocess.run(["node", os.path.join(ROOT, "scripts", "build_public.js")], check=True, capture_output=True, cwd=ROOT)
            self.assertFalse(os.path.exists(os.path.join(self.out, "data", "zz_future_internal.json")))
        finally:
            os.remove(p)
            subprocess.run(["node", os.path.join(ROOT, "scripts", "build_public.js")], check=True, capture_output=True, cwd=ROOT)

    def test_site_and_mobile_feed_still_present(self):
        for f in ("index.html", "app.js", "style.css", "sw.js", "auth.js", "evidence.html", "admin.html", "feed.xml", ".well-known/security.txt", "data/articles.json"):
            self.assertTrue(os.path.exists(os.path.join(self.out, f)), f)
        json.load(open(os.path.join(self.out, "data", "articles.json"), encoding="utf-8"))

    def test_source_and_secrets_dirs_not_deployed(self):
        for d in ("scripts", "tests", "api", ".github", "android-app", "ios-app", "cloudflare-worker", ".git"):
            self.assertFalse(os.path.exists(os.path.join(self.out, d)), d)

    def test_build_fails_loudly_when_required_file_missing(self):
        tmp = tempfile.mkdtemp()
        try:
            os.makedirs(os.path.join(tmp, "scripts")); os.makedirs(os.path.join(tmp, "data"))
            shutil.copy(os.path.join(ROOT, "scripts", "build_public.js"), os.path.join(tmp, "scripts"))
            open(os.path.join(tmp, "index.html"), "w").write("x")
            r = subprocess.run(["node", os.path.join(tmp, "scripts", "build_public.js")], capture_output=True, text=True)
            self.assertNotEqual(r.returncode, 0); self.assertIn("required files missing", r.stderr)
        finally:
            shutil.rmtree(tmp)

    def test_vercel_config_uses_the_built_output(self):
        v = json.load(open(os.path.join(ROOT, "vercel.json")))
        self.assertEqual((v["buildCommand"], v["outputDirectory"]), ("node scripts/build_public.js", "public"))
        self.assertNotIn("rewrites", v)           # rewrites cannot hide files that exist in the deployment


if __name__ == "__main__":
    unittest.main()
