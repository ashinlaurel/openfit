#!/usr/bin/env bash
# Run as root on a fresh Ubuntu 24.04 Oracle VM. Does not change OCI security lists.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

if [[ $(id -u) != 0 ]]; then
  echo 'Run this script as root.' >&2
  exit 1
fi
source /etc/os-release
if [[ ${ID:-} != ubuntu || ${VERSION_ID:-} != 24.04 ]]; then
  echo 'This script supports Ubuntu 24.04 only.' >&2
  exit 1
fi

exec 9>/run/openfit-provision.lock
flock -n 9 || { echo 'Provisioning is already running.' >&2; exit 1; }
install -d -m 700 /var/backups/openfit-provision
if [[ ! -f /var/backups/openfit-provision/iptables-before.rules ]]; then
  iptables-save > /var/backups/openfit-provision/iptables-before.rules
  ip6tables-save > /var/backups/openfit-provision/ip6tables-before.rules
fi

# Give package installation and the two small Node services room on a 1 GB VM.
if [[ ! -f /swap-openfit ]]; then
  fallocate -l 2G /swap-openfit
  chmod 600 /swap-openfit
  mkswap /swap-openfit
fi
if ! swapon --show=NAME --noheadings | grep -qx /swap-openfit; then
  swapon /swap-openfit
fi
if ! grep -q '^/swap-openfit ' /etc/fstab; then
  echo '/swap-openfit none swap sw 0 0' >> /etc/fstab
fi
printf 'vm.swappiness=10\n' > /etc/sysctl.d/90-openfit-swap.conf
sysctl -p /etc/sysctl.d/90-openfit-swap.conf

# Keep all existing rules, particularly Oracle's link-local InstanceServices rules.
# Insert only the web ports before the existing terminal REJECT rule.
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null; then
    iptables -I INPUT 4 -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT
  fi
done
# There is no IPv6 web service configured; don't open an additional IPv6 path.
install -d -m 755 /etc/iptables
iptables-save > /etc/iptables/rules.v4
ip6tables-save > /etc/iptables/rules.v6

apt-get update
apt-get install -y ca-certificates curl docker.io docker-compose-v2 iptables-persistent unattended-upgrades

# Avoid unbounded container logs filling the VM disk. Docker remains root-only.
install -d -m 755 /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  printf '%s\n' '{"log-driver":"local","log-opts":{"max-size":"10m","max-file":"3"},"live-restore":true}' > /etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --now docker
systemctl enable netfilter-persistent
netfilter-persistent save

# Key authentication was tested before applying this. Keep forwarding available
# for SSH tunnels, but remove root login, passwords, and X11 forwarding.
cat > /etc/ssh/sshd_config.d/00-openfit.conf <<'SSH_CONFIG'
PermitRootLogin no
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
X11Forwarding no
MaxAuthTries 3
SSH_CONFIG
sshd -t
systemctl reload ssh

install -d -m 750 /opt/openfit
install -d -m 700 /opt/openfit/secrets /opt/openfit/backups
cat > /etc/apt/apt.conf.d/52openfit-unattended-upgrades <<'APT_CONFIG'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Automatic-Reboot "false";
APT_CONFIG
systemctl enable --now apt-daily.timer apt-daily-upgrade.timer

echo 'OpenFit VM baseline configured. OCI ingress rules must also allow TCP 80 and 443.'
docker --version
docker compose version
free -h
iptables -S INPUT
sshd -T | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|x11forwarding) '
