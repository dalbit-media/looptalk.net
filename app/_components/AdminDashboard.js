"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../public/site/site-i18n";
import { getApiUrl } from "../_lib/apiUrl";

const formatBytes = (bytes, numberFormat, t) => {
  if (!Number.isFinite(bytes)) return t("admin.stats.notMeasured");
  if (bytes < 1024) return `${numberFormat.format(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
};

const InvitationChart = ({ data, numberFormat, t }) => {
  const width = Math.max(640, data.length * 52 + 56);
  const height = 248;
  const padding = { top: 16, right: 16, bottom: 38, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.flatMap((item) => [item.created, item.accepted]));
  const step = data.length ? plotWidth / data.length : plotWidth;
  const barWidth = Math.max(3, Math.min(18, step * 0.28));
  const labelStride = Math.max(1, Math.ceil(data.length / 10));

  return (
    <div className="admin-chart-wrap">
      {data.length ? (
        <div className="admin-chart-viewport">
          <svg
            className="admin-chart"
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: `max(100%, ${width}px)` }}
            preserveAspectRatio="none"
            role="img"
            aria-label={t("admin.stats.chartAria")}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
              const y = padding.top + plotHeight * (1 - fraction);
              return (
                <g key={fraction}>
                  <line className="chart-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
                  <text className="chart-axis-label" x={padding.left - 9} y={y + 4} textAnchor="end">
                    {Math.round(maxValue * fraction)}
                  </text>
                </g>
              );
            })}
            {data.map((item, index) => {
              const center = padding.left + step * index + step / 2;
              const createdHeight = (item.created / maxValue) * plotHeight;
              const acceptedHeight = (item.accepted / maxValue) * plotHeight;
              return (
                <g key={item.key}>
                  <rect
                    className="chart-created-bar"
                    x={center - barWidth - 1}
                    y={padding.top + plotHeight - createdHeight}
                    width={barWidth}
                    height={Math.max(createdHeight, item.created ? 2 : 0)}
                    rx="3"
                  >
                    <title>{t("admin.stats.createdTooltip", { label: item.label, count: numberFormat.format(item.created) })}</title>
                  </rect>
                  <rect
                    className="chart-accepted-bar"
                    x={center + 1}
                    y={padding.top + plotHeight - acceptedHeight}
                    width={barWidth}
                    height={Math.max(acceptedHeight, item.accepted ? 2 : 0)}
                    rx="3"
                  >
                    <title>{t("admin.stats.acceptedTooltip", { label: item.label, count: numberFormat.format(item.accepted) })}</title>
                  </rect>
                  {index % labelStride === 0 && (
                    <text className="chart-axis-label" x={center} y={height - 13} textAnchor="middle">
                      {item.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="admin-chart-empty">{t("admin.stats.noInvitations")}</div>
      )}
      <div className="chart-legend">
        <span><i className="legend-created" />{t("admin.stats.created")}</span>
        <span><i className="legend-accepted" />{t("admin.stats.accepted")}</span>
      </div>
    </div>
  );
};

const WelcomeReplies = ({ t, locale }) => {
  const [replies, setReplies] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const loadReplies = useCallback(async (before = null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const { getItemAsync } = await import("../../mobile/src/utils/tokenStorage");
      const token = await getItemAsync("token");
      if (!token) throw new Error("Administrator sign-in is required");
      const apiUrl = getApiUrl();
      if (!apiUrl) throw new Error("Replies API URL is unavailable");
      const query = before ? `?before=${encodeURIComponent(before)}` : "";
      const response = await fetch(`${apiUrl}/api/admin/welcome-replies${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        setReplies([]);
        setNextCursor(null);
        throw new Error("Administrator access is required");
      }
      if (!response.ok) throw new Error(`Welcome replies request failed (${response.status})`);
      const data = await response.json();
      setReplies((previous) => before ? [...previous, ...data.replies] : data.replies);
      setNextCursor(data.nextCursor);
      setError("");
    } catch (loadError) {
      console.error("Unable to load welcome replies:", loadError);
      setError(t("admin.welcome.loadFailed"));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadReplies();
    const interval = window.setInterval(() => loadReplies(), 60_000);
    return () => window.clearInterval(interval);
  }, [loadReplies]);

  return (
    <section className="admin-welcome-panel admin-panel">
      <div className="admin-section-heading">
        <div>
          <span className="admin-card-kicker">{t("admin.welcome.eyebrow")}</span>
          <h2>{t("admin.welcome.title")}</h2>
          <p>{t("admin.welcome.description")}</p>
        </div>
        <button className="admin-primary-action" disabled={loading} onClick={() => loadReplies()}>
          {t("admin.welcome.refresh")}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">{t("admin.stats.loading")}</p>}
      {!loading && !error && !replies.length && <p>{t("admin.welcome.empty")}</p>}
      <ul className="admin-welcome-replies">
        {replies.map((reply) => (
          <li key={reply.id}>
            <div className="admin-welcome-reply-heading">
              <strong>{reply.sender.displayName} <small>@{reply.sender.username}</small></strong>
              <time dateTime={reply.createdAt}>{new Date(reply.createdAt).toLocaleString(locale)}</time>
            </div>
            <p className="admin-welcome-content">
              {reply.deletedAt
                ? t("admin.welcome.deleted")
                : reply.content || reply.fileName || reply.messageType}
            </p>
            {!reply.deletedAt && reply.mediaUrl?.startsWith("/uploads/") && (
              <a href={`${getApiUrl()}${reply.mediaUrl}`} target="_blank" rel="noopener noreferrer">
                {t("admin.welcome.attachment")}
              </a>
            )}
            {reply.editedAt && <small>{t("admin.welcome.edited")}</small>}
          </li>
        ))}
      </ul>
      {nextCursor && (
        <button className="admin-primary-action" disabled={loading} onClick={() => loadReplies(nextCursor)}>
          {t("admin.welcome.more")}
        </button>
      )}
    </section>
  );
};

export default function AdminDashboard({ publicView = false }) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const locale = "ko-KR";
  const numberFormat = new Intl.NumberFormat(locale);

  const loadOverview = useCallback(async () => {
    try {
      let token = null;
      if (!publicView) {
        const { getItemAsync } = await import("../../mobile/src/utils/tokenStorage");
        token = await getItemAsync("token");
        if (!token) {
          setError(t("admin.stats.signInMessage"));
          return;
        }
      }
      const apiUrl = getApiUrl();
      if (!apiUrl) throw new Error("Statistics API URL is unavailable");
      const response = await fetch(
        `${apiUrl}/api/admin/${publicView ? "public-overview" : "overview"}`,
        {
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
          cache: "no-store",
        }
      );
      if (!response.ok) {
        if (!publicView && (response.status === 401 || response.status === 403)) {
          setError(t("admin.stats.accessDenied"));
          return;
        }
        throw new Error(`Statistics request failed (${response.status})`);
      }
      const data = await response.json();
      setOverview(data);
      setError("");
      setUpdatedAt(new Date(data.generatedAt));
    } catch (loadError) {
      console.error("Unable to load statistics dashboard:", loadError);
      setError(publicView
        ? t("admin.stats.publicLoadFailed")
        : "System metrics could not be loaded. Check the API connection and try again.");
    }
  }, [publicView, t]);

  useEffect(() => {
    loadOverview();
    const interval = window.setInterval(loadOverview, 60_000);
    return () => window.clearInterval(interval);
  }, [loadOverview]);

  if (error) {
    if (publicView) {
      return (
        <section className="admin-access-card" role="status">
          <span className="admin-card-kicker">{t("admin.stats.pageEyebrow")}</span>
          <h2>{t("admin.stats.publicErrorTitle")}</h2>
          <p>{error}</p>
        </section>
      );
    }
    return (
      <section className="admin-access-card" role="status">
        <span className="admin-card-kicker">{t("admin.stats.restricted")}</span>
        <h2>{t("admin.stats.signInRequired")}</h2>
        <p>{error}</p>
        <a className="admin-primary-action" href="/app/?returnTo=/admin">{t("admin.stats.openMessenger")}</a>
      </section>
    );
  }

  if (!overview) {
    return <div className="admin-loading" role="status">{t("admin.stats.loading")}</div>;
  }

  const { counts, invitationTrend, storage, privacy } = overview;
  const acceptedRate = counts.invitations
    ? Math.round((counts.acceptedInvitations / counts.invitations) * 100)
    : 0;

  return (
    <div className="admin-dashboard">
      {!publicView && <WelcomeReplies t={t} locale={locale} />}
      {!publicView && (
        <section className="admin-panel admin-install-panel">
          <div className="admin-section-heading">
            <div>
              <span className="admin-card-kicker">{t("admin.installs.eyebrow")}</span>
              <h2>{t("admin.installs.title")}</h2>
              <p>{t("admin.installs.description")}</p>
            </div>
            <strong className="admin-total-pill">{numberFormat.format(counts.webAppInstalls)}</strong>
          </div>
        </section>
      )}
      <section className="admin-kpi-grid" aria-label={t("admin.stats.platformTotals")}>
        <article className="admin-kpi admin-kpi-primary">
          <span className="admin-card-kicker">{t("admin.stats.people")}</span>
          <strong>{numberFormat.format(counts.users)}</strong>
          <small>{t("admin.stats.registeredAccounts")}</small>
        </article>
        <article className="admin-kpi">
          <span className="admin-card-kicker">{t("admin.stats.invitations")}</span>
          <strong>{numberFormat.format(counts.invitations)}</strong>
          <small>{t("admin.stats.acceptedRate", {
            count: numberFormat.format(counts.acceptedInvitations),
            rate: numberFormat.format(acceptedRate),
          })}</small>
          <span
            className="admin-kpi-progress"
            role="meter"
            aria-label={t("admin.stats.acceptedRate", {
              count: numberFormat.format(counts.acceptedInvitations),
              rate: numberFormat.format(acceptedRate),
            })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={acceptedRate}
          >
            <i style={{ width: `${acceptedRate}%` }} />
          </span>
        </article>
        <article className="admin-kpi">
          <span className="admin-card-kicker">{t("admin.stats.messaging")}</span>
          <strong>{numberFormat.format(counts.messages)}</strong>
          <small>{t("admin.stats.conversationsCount", { count: numberFormat.format(counts.conversations) })}</small>
        </article>
        <article className="admin-kpi">
          <span className="admin-card-kicker">{t("admin.stats.uploads")}</span>
          <strong>{formatBytes(storage.mediaBytes, numberFormat, t)}</strong>
          <small>{t("admin.stats.serverFiles", { count: numberFormat.format(storage.mediaFiles) })}</small>
        </article>
      </section>

      <section className="admin-panel admin-growth-panel">
        <div className="admin-section-heading">
          <div>
            <span className="admin-card-kicker">{t("admin.stats.networkGrowth")}</span>
            <h2>{t("admin.stats.invitationTrend")}</h2>
            <p>{t("admin.stats.invitationTrendDescription")}</p>
          </div>
          <span className="admin-total-pill">{t("admin.stats.totalInvitations", { count: numberFormat.format(counts.invitations) })}</span>
        </div>
        <InvitationChart data={invitationTrend} numberFormat={numberFormat} t={t} />
      </section>

      <section className="admin-storage-section admin-panel">
        <div className="admin-section-heading">
          <div>
            <span className="admin-card-kicker">{t("admin.stats.dataFootprint")}</span>
            <h2>{t("admin.stats.whereDataLives")}</h2>
          </div>
          <span className="admin-updated">{t("admin.stats.updated", {
            time: updatedAt?.toLocaleTimeString(locale) || t("admin.stats.justNow"),
          })}</span>
        </div>
        <div className="admin-storage-grid">
          <article className="admin-storage-card">
            <span className="storage-icon storage-icon-blue">E2EE</span>
            <div><span className="admin-card-kicker">{t("admin.stats.encryptedPending")}</span><strong>{formatBytes(storage.encryptedPendingBytes, numberFormat, t)}</strong></div>
            <p>{t("admin.stats.encryptedPendingDescription", {
              payloads: numberFormat.format(storage.encryptedPendingPayloads),
              deliveries: numberFormat.format(storage.encryptedPendingDeviceDeliveries),
            })}</p>
          </article>
          <article className="admin-storage-card">
            <span className="storage-icon storage-icon-blue">DB</span>
            <div><span className="admin-card-kicker">{t("admin.stats.activeMessagePayload")}</span><strong>{formatBytes(storage.estimatedStoredMessagePayloadBytes, numberFormat, t)}</strong></div>
            <p>{t("admin.stats.activeMessageDescription")}</p>
          </article>
          <article className="admin-storage-card">
            <span className="storage-icon storage-icon-coral">↗</span>
            <div><span className="admin-card-kicker">{t("admin.stats.unreadPayloadEstimate")}</span><strong>{formatBytes(storage.estimatedUnreadPayloadBytes, numberFormat, t)}</strong></div>
            <p>{t("admin.stats.unreadPayloadDescription", { count: numberFormat.format(storage.unreadDeliveries) })}</p>
          </article>
          <article className="admin-storage-card admin-storage-unavailable">
            <span className="storage-icon storage-icon-muted">?</span>
            <div><span className="admin-card-kicker">{t("admin.stats.localClientData")}</span><strong>{t("admin.stats.notMeasured")}</strong></div>
            <p>{t("admin.stats.localClientDescription")}</p>
          </article>
          <article className="admin-storage-card admin-storage-unavailable">
            <span className="storage-icon storage-icon-muted">—</span>
            <div><span className="admin-card-kicker">{t("admin.stats.userBackups")}</span><strong>{t("admin.stats.notSupported")}</strong></div>
            <p>{t("admin.stats.backupDescription")}</p>
          </article>
        </div>
      </section>

      <section className="admin-integrity-panel">
        <div>
          <span className="admin-card-kicker">{t("admin.stats.privacyEncryption")}</span>
          <h2>{privacy.endToEndEncryptionEnabled ? t("admin.stats.e2eeEnabled") : t("admin.stats.e2eeNotImplemented")}</h2>
          <p>{privacy.serverCanReadMessageContent
            ? t("admin.stats.serverCanRead")
            : t("admin.stats.serverCannotRead")}</p>
        </div>
        <span className="admin-integrity-status">{privacy.endToEndEncryptionEnabled
          ? t("admin.stats.e2eeOn")
          : t("admin.stats.e2eeOff")}</span>
      </section>

      <p className="admin-footnote">{t("admin.stats.metricsNote")}</p>
    </div>
  );
}
