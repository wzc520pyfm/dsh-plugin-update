window.__ModuleLoader__.load({
  id: "@wzc520pyfm/dsh-plugin-update",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");

    const css = `
.dpu-wrap { padding: 4px 2px; max-width: 760px; }
.dpu-head { font-size: 15px; font-weight: 600; margin: 0 0 4px; color: var(--dsw-alias-label-primary); }
.dpu-hint { font-size: 12px; color: var(--dsw-alias-label-secondary); margin: 0 0 12px; line-height: 1.5; }
.dpu-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); margin: 0 0 6px; }
.dpu-main { min-width: 0; flex: 1; }
.dpu-title { font-size: 13px; color: var(--dsw-alias-label-primary); }
.dpu-meta { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 2px; word-break: break-all; }
.dpu-notes { font-size: 12px; color: var(--dsw-alias-label-primary); white-space: pre-wrap; margin: 6px 0 0; }
.dpu-actions { display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0; }
.dpu-btn { font-size: 12px; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); cursor: pointer; }
.dpu-btn:disabled { opacity: .55; cursor: default; }
.dpu-msg { font-size: 12px; margin: 8px 0; }
.dpu-ok { color: var(--dsw-alias-state-success-primary); }
.dpu-err { color: var(--dsw-alias-state-error-primary); }
.dpu-bar { display: flex; gap: 6px; margin: 0 0 10px; }
.dpu-empty { font-size: 12px; color: var(--dsw-alias-label-secondary); }
`;
    const tagId = "dsh-plugin-update/panel.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-plugin-update";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    async function call(op, payload) {
      const response = await fetch("/dsh-plugin-update/" + op, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload || {}),
      });
      const text = await response.text();
      if (text === "") return { ok: false, message: "服务端返回为空" };
      try { return JSON.parse(text); } catch { return { ok: false, message: "服务端返回无法解析" }; }
    }

    function line(row) {
      if (row.channel === "git") return (row.from || "未知提交") + " → " + (row.target || "远端");
      return (row.from || row.spec) + " → " + row.target;
    }

    function Panel(props) {
      const [report, setReport] = React.useState(null);
      const [message, setMessage] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const summary = props && props.view === "summary";

      const refresh = React.useCallback(async () => {
        setBusy(true);
        setMessage(null);
        try {
          const result = await call("check", {});
          setReport(result);
          if (result && result.ok !== true) setMessage({ kind: "err", text: result.message || "检查失败" });
        } catch (error) {
          setMessage({ kind: "err", text: String(error && error.message ? error.message : error) });
        } finally {
          setBusy(false);
        }
      }, []);

      React.useEffect(() => { if (!summary) void refresh(); }, [summary, refresh]);

      if (summary) return React.createElement("span", null, "检查已安装插件，校验通过后再替换");

      const act = async (op, payload) => {
        setBusy(true);
        setMessage(null);
        try {
          const result = await call(op, payload);
          setMessage({ kind: result && result.ok ? "ok" : "err", text: (result && result.message) || "完成" });
          const next = await call("check", {});
          setReport(next);
        } catch (error) {
          setMessage({ kind: "err", text: String(error && error.message ? error.message : error) });
        } finally {
          setBusy(false);
        }
      };

      const updates = report && report.updates || [];
      const uncertain = report && report.uncertain || [];
      const snoozed = report && report.snoozed || [];
      const pinned = report && report.pinned || [];
      const errors = report && report.errors || [];
      const rollbackable = report && report.rollbackable || [];

      const row = (item, buttons) => React.createElement("div", { key: item.name + (item.target || ""), className: "dpu-row" },
        React.createElement("div", { className: "dpu-main" },
          React.createElement("div", { className: "dpu-title" }, item.name + (item.self ? "（这个插件自己）" : "")),
          React.createElement("div", { className: "dpu-meta" }, item.reason || line(item)),
          item.notes ? React.createElement("pre", { className: "dpu-notes" }, item.notes) : null,
        ),
        React.createElement("div", { className: "dpu-actions" }, buttons),
      );

      return React.createElement("div", { className: "dpu-wrap" },
        React.createElement("h3", { className: "dpu-head" }, "插件更新"),
        React.createElement("p", { className: "dpu-hint" }, "先在临时目录装好并核对补丁文件，再改 profile。失败会写回原来的 package.json、锁文件和 cordis.patch.yml，不会先卸载。更新说明和「这次先不更新」是两件事。换完需要重启 dsh。"),
        React.createElement("div", { className: "dpu-bar" },
          React.createElement("button", { className: "dpu-btn", disabled: busy, onClick: () => { void refresh(); } }, busy ? "进行中…" : "检查更新"),
          React.createElement("button", { className: "dpu-btn", disabled: busy || updates.length === 0, onClick: () => { void act("apply", { all: true, confirm: true }); } }, "全部更新"),
        ),
        message ? React.createElement("div", { className: "dpu-msg " + (message.kind === "ok" ? "dpu-ok" : "dpu-err") }, message.text) : null,
        !report ? React.createElement("div", { className: "dpu-empty" }, "正在检查…") : null,
        updates.length === 0 && report && report.ok ? React.createElement("div", { className: "dpu-empty" }, "没有可直接更新的插件。") : null,
        updates.map(item => row(item, [
          React.createElement("button", { key: "go", className: "dpu-btn", disabled: busy, onClick: () => { void act("apply", { name: item.name, confirm: true }); } }, "更新"),
          React.createElement("button", { key: "later", className: "dpu-btn", disabled: busy, onClick: () => { void act("snooze", { name: item.name, version: item.snoozeKey }); } }, "这次先不更新"),
        ])),
        rollbackable.length > 0 ? React.createElement("h3", { className: "dpu-head" }, "可以回到更新前") : null,
        rollbackable.map(pluginName => React.createElement("div", { key: "roll-" + pluginName, className: "dpu-row" },
          React.createElement("div", { className: "dpu-main" },
            React.createElement("div", { className: "dpu-title" }, pluginName),
            React.createElement("div", { className: "dpu-meta" }, "恢复这次更新之前的依赖、锁文件和 cordis.patch.yml"),
          ),
          React.createElement("div", { className: "dpu-actions" },
            React.createElement("button", { className: "dpu-btn", disabled: busy, onClick: () => { void act("rollback", { name: pluginName, confirm: true }); } }, "回滚"),
          ),
        )),
        uncertain.length > 0 ? React.createElement("h3", { className: "dpu-head" }, "无法判断是否有新提交") : null,
        uncertain.map(item => row(item, [
          React.createElement("button", { key: "force", className: "dpu-btn", disabled: busy, onClick: () => { void act("apply", { name: item.name, confirm: true, force: true }); } }, "安装远端并校验"),
        ])),
        snoozed.length > 0 ? React.createElement("h3", { className: "dpu-head" }, "这次先不更新") : null,
        snoozed.map(item => row(item, [
          React.createElement("button", { key: "back", className: "dpu-btn", disabled: busy, onClick: () => { void act("unsnooze", { name: item.name }); } }, "恢复提醒"),
        ])),
        errors.length > 0 ? React.createElement("h3", { className: "dpu-head" }, "没查到") : null,
        errors.map(item => React.createElement("div", { key: item.name, className: "dpu-meta" }, item.name + "：" + item.message)),
        pinned.length > 0 ? React.createElement("h3", { className: "dpu-head" }, "没有自动更新通道") : null,
        pinned.map(item => React.createElement("div", { key: item.name, className: "dpu-meta" }, item.name + "：" + (item.reason || item.spec))),
      );
    }

    function mount(ctx, slot, spec) {
      ctx.effect(() => {
        try {
          return ctx.slots.inject(slot, () => ctx.slots.register(spec, Panel));
        } catch (error) {
          console.warn("[dsh-plugin-update] " + slot + " " + (error && error.message ? error.message : error));
        }
      }, "dsh-plugin-update: " + slot);
    }

    function apply(ctx) {
      mount(ctx, "settings.section", {
        name: "settings.section",
        id: "plugin-update",
        order: 40,
        label: () => "插件更新",
      });
      mount(ctx, "plugins.bundle.config", {
        name: "plugins.bundle.config",
        key: "@wzc520pyfm/dsh-plugin-update",
      });
    }

    exports.inject = ["slots"];
    exports.apply = apply;
    return module.exports;
  },
});
