(function () {
  const KEYCHAIN_SERVICE = "UsageLeft-copilot";
  const GH_KEYCHAIN_SERVICE = "gh:github.com";
  const USAGE_URL = "https://api.github.com/copilot_internal/user";
  const USER_URL = "https://api.github.com/user";

  function readJson(ctx, path) {
    try {
      if (!ctx.host.fs.exists(path)) return null;
      const text = ctx.host.fs.readText(path);
      return ctx.util.tryParseJson(text);
    } catch (e) {
      ctx.host.log.warn("readJson failed for " + path + ": " + String(e));
      return null;
    }
  }

  function writeJson(ctx, path, value) {
    try {
      ctx.host.fs.writeText(path, JSON.stringify(value));
    } catch (e) {
      ctx.host.log.warn("writeJson failed for " + path + ": " + String(e));
    }
  }

  function saveToken(ctx, token, username) {
    const payload = { token: token };
    if (username) payload.username = username;
    try {
      ctx.host.keychain.writeGenericPassword(
        KEYCHAIN_SERVICE,
        JSON.stringify(payload),
      );
    } catch (e) {
      ctx.host.log.warn("keychain write failed: " + String(e));
    }
    writeJson(ctx, ctx.app.pluginDataDir + "/auth.json", payload);
  }

  function normalizeAccount(value) {
    if (typeof value !== "string") return null;
    var trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  function loadSelectedAccount(ctx) {
    var data = readJson(ctx, ctx.app.pluginDataDir + "/config.json");
    return normalizeAccount(data && data.account);
  }

  function clearCachedToken(ctx) {
    try {
      ctx.host.keychain.deleteGenericPassword(KEYCHAIN_SERVICE);
    } catch (e) {
      ctx.host.log.info("keychain delete failed: " + String(e));
    }
    writeJson(ctx, ctx.app.pluginDataDir + "/auth.json", null);
  }

  function loadTokenFromKeychain(ctx) {
    try {
      const raw = ctx.host.keychain.readGenericPassword(KEYCHAIN_SERVICE);
      if (raw) {
        const parsed = ctx.util.tryParseJson(raw);
        if (parsed && parsed.token) {
          ctx.host.log.info("token loaded from UsageLeft keychain");
          return { token: parsed.token, source: "keychain", username: parsed.username || null };
        }
      }
    } catch (e) {
      ctx.host.log.info("UsageLeft keychain read failed: " + String(e));
    }
    return null;
  }

  function loadTokenFromGhCli(ctx) {
    try {
      const raw = ctx.host.keychain.readGenericPassword(GH_KEYCHAIN_SERVICE);
      if (raw) {
        let token = raw;
        if (
          typeof token === "string" &&
          token.indexOf("go-keyring-base64:") === 0
        ) {
          token = ctx.base64.decode(token.slice("go-keyring-base64:".length));
        }
        if (token) {
          ctx.host.log.info("token loaded from gh CLI keychain");
          return { token: token, source: "gh-cli", username: null };
        }
      }
    } catch (e) {
      ctx.host.log.info("gh CLI keychain read failed: " + String(e));
    }
    return null;
  }

  function loadTokenFromStateFile(ctx) {
    const data = readJson(ctx, ctx.app.pluginDataDir + "/auth.json");
    if (data && data.token) {
      ctx.host.log.info("token loaded from state file");
      return { token: data.token, source: "state", username: data.username || null };
    }
    return null;
  }

  function parseGhHostsYml(text) {
    var lines = text.split(/\r?\n/)
    var usernames = []
    var phase = 0 // 0=find github.com, 1=find users:, 2=collect usernames
    var usersIndent = -1
    var usernameIndent = -1
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      if (!line.trim() || line.trim().charAt(0) === "#") continue
      var indent = 0
      while (indent < line.length && (line[indent] === " " || line[indent] === "\t")) indent++
      var trimmed = line.trim()
      if (phase === 0) {
        if (trimmed === "github.com:") phase = 1
      } else if (phase === 1) {
        if (indent === 0) break // left github.com block
        if (trimmed.indexOf("user:") === 0) {
          var user = normalizeAccount(trimmed.slice("user:".length))
          if (user && usernames.indexOf(user) === -1) usernames.push(user)
        }
        if (trimmed === "users:") { usersIndent = indent; phase = 2 }
      } else {
        if (indent <= usersIndent) break // left users block
        if (usernameIndent === -1) usernameIndent = indent
        if (indent === usernameIndent && trimmed.endsWith(":")) {
          var username = normalizeAccount(trimmed.slice(0, -1))
          if (username && usernames.indexOf(username) === -1) usernames.push(username)
        } else if (indent < usernameIndent) {
          break
        }
      }
    }
    return usernames
  }

  function loadTokenFromSelectedAccount(ctx, account) {
    try {
      var token = ctx.host.ghToken(account)
      if (token) {
        ctx.host.log.info("token loaded from selected gh account: " + account)
        return { token: token, source: "gh-command", username: account }
      }
    } catch (e) {
      ctx.host.log.warn("selected gh account " + account + " token failed: " + String(e))
    }
    return null
  }

  function loadTokenFromGhCommand(ctx) {
    // Try active account
    try {
      var token = ctx.host.ghToken()
      if (token) {
        ctx.host.log.info("token loaded from gh active account")
        return { token: token, source: "gh-command", username: null }
      }
    } catch (e) {
      ctx.host.log.info("gh active account token failed: " + String(e))
    }
    // Try all named accounts
    try {
      var hostsPath = "~/.config/gh/hosts.yml"
      if (ctx.host.fs.exists(hostsPath)) {
        var users = parseGhHostsYml(ctx.host.fs.readText(hostsPath))
        for (var i = 0; i < users.length; i++) {
          try {
            var t = ctx.host.ghToken(users[i])
            if (t) {
              ctx.host.log.info("token loaded from gh account: " + users[i])
              return { token: t, source: "gh-command", username: users[i] }
            }
          } catch (e) {
            ctx.host.log.info("gh account " + users[i] + " failed: " + String(e))
          }
        }
      }
    } catch (e) {
      ctx.host.log.warn("loadTokenFromGhCommand accounts scan failed: " + String(e))
    }
    return null
  }

  function loadToken(ctx, selectedAccount) {
    if (selectedAccount) {
      return loadTokenFromSelectedAccount(ctx, selectedAccount);
    }
    return (
      loadTokenFromKeychain(ctx) ||
      loadTokenFromGhCli(ctx) ||
      loadTokenFromStateFile(ctx) ||
      loadTokenFromGhCommand(ctx)
    );
  }

  function fetchUsage(ctx, token) {
    return ctx.util.request({
      method: "GET",
      url: USAGE_URL,
      headers: {
        Authorization: "token " + token,
        Accept: "application/json",
        "Editor-Version": "vscode/1.96.2",
        "Editor-Plugin-Version": "copilot-chat/0.26.7",
        "User-Agent": "GitHubCopilotChat/0.26.7",
        "X-Github-Api-Version": "2025-04-01",
      },
      timeoutMs: 10000,
    });
  }

  function fetchGithubUsername(ctx, token) {
    try {
      const resp = ctx.util.request({
        method: "GET",
        url: USER_URL,
        headers: {
          Authorization: "token " + token,
          Accept: "application/json",
          "User-Agent": "UsageLeft",
          "X-Github-Api-Version": "2025-04-01",
        },
        timeoutMs: 10000,
      });
      if (resp.status < 200 || resp.status >= 300) {
        ctx.host.log.warn("GitHub user request returned status: " + resp.status);
        return null;
      }
      const data = ctx.util.tryParseJson(resp.bodyText);
      if (data && typeof data.login === "string" && data.login.trim()) {
        return data.login.trim();
      }
    } catch (e) {
      ctx.host.log.warn("GitHub user request failed: " + String(e));
    }
    return null;
  }

  function makeProgressLine(ctx, label, snapshot, resetDate) {
    if (!snapshot || typeof snapshot.percent_remaining !== "number")
      return null;

    // Use real counts if both remaining and entitlement are available
    const remaining = snapshot.remaining;
    const entitlement = snapshot.entitlement;
    const hasRealCounts = typeof remaining === "number" && typeof entitlement === "number" && entitlement > 0;

    if (hasRealCounts) {
      const used = entitlement - remaining;
      return ctx.line.progress({
        label: label,
        used: used,
        limit: entitlement,
        format: { kind: "count", suffix: "req" },
        resetsAt: ctx.util.toIso(resetDate),
        periodDurationMs: 30 * 24 * 60 * 60 * 1000,
      });
    }

    // Fallback: percent-based
    const usedPercent = Math.min(100, Math.max(0, 100 - snapshot.percent_remaining));
    return ctx.line.progress({
      label: label,
      used: usedPercent,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: ctx.util.toIso(resetDate),
      periodDurationMs: 30 * 24 * 60 * 60 * 1000,
    });
  }

  function makeLimitedProgressLine(ctx, label, remaining, total, resetDate) {
    if (typeof remaining !== "number" || typeof total !== "number" || total <= 0)
      return null;
    const used = total - remaining;
    const usedPercent = Math.min(100, Math.max(0, Math.round((used / total) * 100)));
    return ctx.line.progress({
      label: label,
      used: usedPercent,
      limit: 100,
      format: { kind: "percent" },
      resetsAt: ctx.util.toIso(resetDate),
      periodDurationMs: 30 * 24 * 60 * 60 * 1000,
    });
  }

  function probe(ctx) {
    const selectedAccount = loadSelectedAccount(ctx);
    const cred = loadToken(ctx, selectedAccount);
    if (!cred) {
      if (selectedAccount) {
        throw "GitHub account " + selectedAccount + " is not available. Run `gh auth login` for that account first.";
      }
      throw "Not logged in. Run `gh auth login` first.";
    }

    let token = cred.token;
    let source = cred.source;
    let username = cred.username || null;

    let resp;
    try {
      resp = fetchUsage(ctx, token);
    } catch (e) {
      ctx.host.log.error("usage request exception: " + String(e));
      throw "Usage request failed. Check your connection.";
    }

    if (resp.status === 401 || resp.status === 403) {
      if (selectedAccount) {
        throw "No Copilot access or token invalid for " + selectedAccount + ". Run `gh auth refresh` or `gh auth login` for that account.";
      }
      // Clear stale cached token and try all gh accounts sequentially
      if (source === "keychain") {
        ctx.host.log.info("cached token invalid, clearing and retrying")
        clearCachedToken(ctx)
      }
      // Try every known gh account until one has Copilot access
      var allAccounts = [null]
      try {
        var hostsPath = "~/.config/gh/hosts.yml"
        if (ctx.host.fs.exists(hostsPath)) {
          var ghUsers = parseGhHostsYml(ctx.host.fs.readText(hostsPath))
          for (var gi = 0; gi < ghUsers.length; gi++) allAccounts.push(ghUsers[gi])
        }
      } catch (e) {}
      for (var ai = 0; ai < allAccounts.length; ai++) {
        try {
          var ghTok = ctx.host.ghToken(allAccounts[ai])
          if (!ghTok) continue
          var tryResp = fetchUsage(ctx, ghTok)
          if (tryResp.status >= 200 && tryResp.status < 300) {
            resp = tryResp
            token = ghTok
            username = allAccounts[ai] || null
            source = "gh-command"
            saveToken(ctx, ghTok, username)
            break
          }
        } catch (e) {
          ctx.host.log.info("gh account " + (allAccounts[ai] || "active") + " retry failed: " + String(e))
        }
      }
      // Still failing after retry
      if (resp.status === 401 || resp.status === 403) {
        throw "Token invalid. Run `gh auth login` to re-authenticate.";
      }
    }

    if (resp.status < 200 || resp.status >= 300) {
      ctx.host.log.error("usage returned error: status=" + resp.status);
      throw (
        "Usage request failed (HTTP " +
        String(resp.status) +
        "). Try again later."
      );
    }

    const data = ctx.util.tryParseJson(resp.bodyText);
    if (data === null) {
      throw "Usage response invalid. Try again later.";
    }

    ctx.host.log.info("usage fetch succeeded");

    username = fetchGithubUsername(ctx, token) || username;

    // Persist gh tokens to UsageLeft state for future use.
    if (source === "gh-cli" || source === "gh-command") {
      saveToken(ctx, token, username);
    }

    const lines = [];
    let plan = null;
    if (data.copilot_plan) {
      plan = ctx.fmt.planLabel(data.copilot_plan);
    }

    const accountLine = username
      ? ctx.line.text({ label: "Account", value: username })
      : null;

    // Paid tier: quota_snapshots
    const snapshots = data.quota_snapshots;
    if (snapshots) {
      const premiumLine = makeProgressLine(
        ctx,
        "Premium",
        snapshots.premium_interactions,
        data.quota_reset_date,
      );
      if (premiumLine) lines.push(premiumLine);

      const chatLine = makeProgressLine(
        ctx,
        "Chat",
        snapshots.chat,
        data.quota_reset_date,
      );
      if (chatLine) lines.push(chatLine);
    }

    // Free tier: limited_user_quotas
    if (data.limited_user_quotas && data.monthly_quotas) {
      const lq = data.limited_user_quotas;
      const mq = data.monthly_quotas;
      const resetDate = data.limited_user_reset_date;

      const chatLine = makeLimitedProgressLine(ctx, "Chat", lq.chat, mq.chat, resetDate);
      if (chatLine) lines.push(chatLine);

      const completionsLine = makeLimitedProgressLine(ctx, "Completions", lq.completions, mq.completions, resetDate);
      if (completionsLine) lines.push(completionsLine);
    }

    if (lines.length === 0) {
      lines.push(
        ctx.line.badge({
          label: "Status",
          text: "No usage data",
          color: "#a3a3a3",
        }),
      );
    }

    if (accountLine) lines.unshift(accountLine);

    return { plan: plan, lines: lines };
  }

  globalThis.__usageleft_plugin = { id: "copilot", probe };
})();
