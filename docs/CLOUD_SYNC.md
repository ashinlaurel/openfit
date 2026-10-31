# Open Gym and OpenFit cloud storage

The Oracle VM will host both Open Gym's server and the OpenFit cloud API. Open Gym's repository
already includes the receiving server: the Android app pairs with that self-hosted instance and
syncs its workout profile to it. No existing or third-party Open Gym hosting is required.
OpenFit pairs with the same profile using Open Gym's one-time device code and reads the profile
document through the authenticated `/api/data` endpoint. This integration does not copy Open Gym
records into a second database. OpenFit's cloud API stores its own todos, habits, report index,
and source PDF files. Google Health credentials and health caches remain on each OpenFit desktop.

## Prepare an Oracle Ubuntu VM

`cloud/provision-vm.sh` prepares a fresh Ubuntu 24.04 VM for the services. Review it, then run it
as root over an already-tested SSH connection. It installs Docker and Compose, adds 2 GiB swap,
limits container logs, enables automatic security updates without automatic reboot, and disables
root and password SSH login. It preserves the existing Oracle networking rules and saves a
firewall snapshot under `/var/backups/openfit-provision/` before adding TCP 80 and 443. It does
not deploy the apps or configure TLS.

Oracle has a separate cloud firewall. In the instance's subnet security list or attached network
security group, allow **stateful ingress TCP 80 and TCP 443**, source `0.0.0.0/0`, with all source
ports. Keep SSH on TCP 22 restricted to the administrator's public IP where practical. Do not
open the internal API ports (3000 and 3100), Docker's API, or a whole range of inbound ports.
See [Oracle's security rules documentation](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securityrules.htm).

Public DNS hostnames and valid HTTPS certificates are needed before pairing the apps. Deploy
Open Gym's API and web frontend on the same VM, using the Open Gym repository's self-hosting
instructions. Bind its web port to loopback, for example `127.0.0.1:8080:80`, and configure the
HTTPS proxy for `gym.example.com`. Set Open Gym's `RP_ID=gym.example.com` and
`ORIGIN=https://gym.example.com`; then register the owner's profile before exposing signup to
others. Back up Open Gym's data directory along with the OpenFit archive and its encryption key.

## Deploy the OpenFit cloud API

### Combined Open Gym and OpenFit stack

For a new VM, `cloud/opengym-compose.yaml` deploys Open Gym's API and frontend, the OpenFit
cloud API, and a Caddy HTTPS proxy together. Only the proxy publishes host ports (80 and 443).
Open Gym runs as an unprivileged user and keeps its profile files in `/opt/openfit/data/gym`.
The OpenFit API reads Open Gym over the private Docker network; Google Health data is not sent
to this stack.

Copy `cloud/server.mjs`, `cloud/exercise-names.json`, `cloud/Dockerfile`, `cloud/opengym-compose.yaml`, `cloud/Caddyfile`,
and `cloud/deploy-stack.sh` to `/opt/openfit/cloud/` on the prepared VM. Point two DNS hostnames
at the VM, then run:

```sh
sudo docker pull ghcr.io/duartesantos8/opengym-api:latest
sudo docker pull ghcr.io/duartesantos8/opengym-web:latest
sudo docker pull caddy:2-alpine
sudo bash /opt/openfit/cloud/deploy-stack.sh gym.example.com api.example.com
```

The deployment script pins the downloaded images by digest and creates a root-only `.env`
with a fresh OpenFit storage key. Repeat runs preserve the existing key, origins, and pins.
Open Gym starts with invite-only signup and no password login. The one-use owner invitation
is stored in `/opt/openfit/secrets/owner-invite`; the first profile registered with it becomes
the administrator. Open the gym hostname in a browser, create a profile with that invite and
a passkey, then generate a separate mobile pairing code under **Settings → Account → Pair
the mobile app**. Enter the gym HTTPS origin and that pairing code in the Android APK. If the
phone offers to merge existing local workouts, keep them when pairing.

The OpenFit desktop uses the API hostname and a fresh mobile pairing code from the same profile.
Never use the owner signup invitation as a mobile pairing code.

Manage the deployment with:

```sh
sudo docker compose -f /opt/openfit/cloud/opengym-compose.yaml ps
sudo docker compose -f /opt/openfit/cloud/opengym-compose.yaml logs --tail=50
```

Back up `/opt/openfit/data` and the root-only deployment `.env` securely. Container restarts and
image replacement preserve those host directories; deleting them removes the stored data. A
copy retained on the VM alone does not protect against losing the VM. If a free `sslip.io` name
is used initially, retain the VM's public IP: the hostname and its passkeys are tied to it.

### Standalone OpenFit API

Use a separate API hostname such as `api.example.com`, alongside the Open Gym hostname
`gym.example.com` on the same VM. After Open Gym is running, on the VM:

```sh
mkdir -p /opt/openfit-cloud
cp -R cloud /opt/openfit-cloud/
mkdir -p /opt/openfit-cloud/cloud/data
chown 1000:1000 /opt/openfit-cloud/cloud/data
cp /opt/openfit-cloud/cloud/.env.example /opt/openfit-cloud/cloud/.env
```

Edit `cloud/.env` and set `OPEN_GYM_API_URL` to the HTTPS origin of the Open Gym instance. Generate
`STORAGE_KEY` with `openssl rand -hex 32`. Store the key in the VM's secret manager or a root-only
`.env` file. Back up `/opt/openfit-cloud/cloud/data` and this key together. The files in `data/`
are encrypted with AES-256-GCM before they are written to disk; losing the key makes those files
unreadable.

Start the service:

```sh
cd /opt/openfit-cloud/cloud
docker compose up -d --build
```

It listens only on `127.0.0.1:3100`. Add this site to the VM's existing Caddy configuration:

```caddy
api.example.com {
    reverse_proxy 127.0.0.1:3100
}
```

The public service should be reachable only through HTTPS. Check `https://api.example.com/healthz`
to confirm it is running.

## Pair OpenFit

In Open Gym, sign into the profile whose workouts OpenFit should show. Open **Settings → Account →
Pair the mobile app** and create a fresh one-time code. OpenFit redeems the code through the cloud
API, then keeps the resulting bearer credential in the operating system's encrypted storage. The
code expires after five minutes. The bearer credential can read and write that Open Gym profile,
so protect the desktop account. Removing the connection in OpenFit clears its local copy. To revoke
the token on Open Gym, use **Settings → Account → Sign out everywhere**; this revokes all paired
devices for the profile.

## Combine gym sessions with Google Health

OpenFit's **Gym** view combines a saved Open Gym session with a Google Health exercise recording
on the desktop. The visible period is the 28 days through the selected dashboard date. The matcher
also reads adjacent cached days so two recordings of a midnight session can start on different dates.
While the view is visible, it refreshes the Open Gym profile every 30 seconds and on returning to
the app. **Sync sources** also runs the existing Google Health sync.

Automatic links require reliable absolute start/end times, at least 70% overlap of the shorter
recording and 60% of the longer one, and reasonably aligned boundaries. Obvious unrelated aerobic
recordings are excluded from lifting sessions. Both sides must have a clear best candidate;
duplicate or similarly plausible recordings are left for review. One recording is assigned to at
most one gym session. Active duration is never treated as elapsed duration when pauses are unknown.

Sets, reps, weights, effort, duration and reported volume come from Open Gym. The cloud API supplies
display names for known exercise IDs from the Open Gym 1.4.1 catalogue without changing the saved
workout document. Google Health supplies the original Fitbit recording's reported heart rate,
calories and zone minutes. Those metrics are not prorated to the gym session or added to daily totals
again. The heart-rate graph selects existing local samples inside the gym session's exact boundaries,
preserving gaps. It does not infer per-set heart rate.

Users can choose a recording manually, keep a session separate, or restore automatic matching.
Only record IDs and these decisions are saved, encrypted on the desktop in
`workout-links.secure.json`, scoped by API origin and Open Gym profile. No Google Health workout
payload is uploaded to the VM. A missing manually linked recording stays unresolved until it is
available again or the user changes the link. Demo health data never matches a real gym profile.

The last successful Open Gym read is encrypted locally in `open-gym-cache.secure.json`. Network
or server failures can show that copy with an offline notice; failed authorization cannot fetch a
cached response through the API handler. Removing the connection deletes the local gym snapshot.

For developer-assisted setup, `scripts/pair-cloud.cjs` redeems a fresh device code supplied on stdin
and saves the credential using OpenFit's existing OS encryption identity. The desktop must restart
after preload/main-process updates. It never needs the phone's bearer token or a Google credential.
`scripts/configure-google-health.cjs --client=PATH` imports a downloaded Google OAuth Web client
into the same encrypted local storage, with the registered loopback callback. The user still completes
Google sign-in through OpenFit's existing browser flow. `scripts/check-gym-link.cjs` checks the live
server connection and local provider availability without printing credentials or workout contents.

## Cloud archive contents

The cloud archive is partitioned by the Open Gym profile ID. It contains todo and habit archives,
the reviewed report index, encrypted source PDFs, body history, and Google Health metric snapshots.
Report PDFs retain their SHA-256 identity and are encrypted at rest on the VM. Health snapshots are
allowlisted (activity, sleep, body metrics, heart signals, glucose, ECG, nutrition, and related
measurements); OAuth tokens, profile identity, paired devices, and GPS route files are excluded.

Each archive write uses a revision number. If another OpenFit device saves first, the API returns
`409` with the current archive; clients must reconcile before retrying. Local encrypted copies stay
available for recovery when the VM cannot be reached.
