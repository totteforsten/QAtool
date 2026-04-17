(function () {
	const $ = (sel, root = document) => root.querySelector(sel);

	const btn = $('#qatool-run');
	const status = $('#qatool-status');
	const results = $('#qatool-results');
	if (!btn) return;

	btn.addEventListener('click', runScan);

	async function runScan() {
		btn.disabled = true;
		status.textContent = 'Scanning…';
		results.innerHTML = '';
		try {
			const form = new FormData();
			form.append('action', 'qatool_scan');
			form.append('nonce', QATool.nonce);
			if ($('#qatool-deep').checked) form.append('deep', '1');
			const res = await fetch(QATool.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: form });
			const json = await res.json();
			if (!json.success) throw new Error(json.data || 'Scan failed');
			renderReports(json.data.reports || []);
			status.textContent = `Scanned ${json.data.reports.length} page(s).`;
		} catch (e) {
			status.textContent = 'Error: ' + (e.message || e);
		} finally {
			btn.disabled = false;
		}
	}

	function renderReports(reports) {
		if (!reports.length) { results.innerHTML = '<p>No pages scanned.</p>'; return; }
		const frag = document.createDocumentFragment();
		for (const r of reports) frag.appendChild(renderReport(r));
		results.appendChild(frag);
	}

	function renderReport(r) {
		const wrap = document.createElement('div');
		wrap.className = 'qatool-report';

		const head = document.createElement('div');
		head.className = 'qatool-report-head';
		const totals = summarize(r.findings || []);
		head.innerHTML = `
			<div>
				<h3>${escapeHtml(r.url)}</h3>
				<div>
					<span class="qatool-score">SEO ${r.score ? r.score.seo : '—'}</span>
					<span class="qatool-score">Resp ${r.score ? r.score.responsive : '—'}</span>
					${r.builder ? `<span class="qatool-tag">${escapeHtml(r.builder)}</span>` : ''}
					${r.post_id ? `<span class="qatool-tag">post #${r.post_id}</span>` : '<span class="qatool-tag">no WP match</span>'}
					${totals.critical ? `<span class="qatool-sev critical" style="margin-left:6px">${totals.critical} critical</span>` : ''}
					${totals.warning ? `<span class="qatool-sev warning" style="margin-left:6px">${totals.warning} warn</span>` : ''}
				</div>
			</div>
			<span>▾</span>
		`;
		const body = document.createElement('div');
		body.className = 'qatool-report-body';
		body.style.display = 'none';
		head.addEventListener('click', () => {
			body.style.display = body.style.display === 'none' ? 'block' : 'none';
		});

		if (r.error) {
			body.innerHTML = `<p style="color:#a62626">${escapeHtml(r.error)}</p>`;
		} else {
			if (r.viewports && r.viewports.length) {
				const vp = document.createElement('div');
				vp.className = 'qatool-viewports';
				vp.innerHTML = '<strong>Viewports:</strong> ' + r.viewports.map(v => `<span class="qatool-tag">${escapeHtml(v.viewport)} ${v.width}×${v.height} · ${v.findingCount}</span>`).join(' ');
				body.appendChild(vp);
			}
			for (const f of r.findings || []) body.appendChild(renderFinding(r, f));
			if (r.links && r.links.length) body.appendChild(renderLinks(r.links));
			body.appendChild(renderHistory(r));
		}
		wrap.append(head, body);
		return wrap;
	}

	function summarize(findings) {
		return findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, { critical: 0, warning: 0, info: 0 });
	}

	function renderFinding(report, f) {
		const row = document.createElement('div');
		row.className = 'qatool-finding';
		const sev = document.createElement('span');
		sev.className = 'qatool-sev ' + f.severity;
		sev.textContent = f.severity;
		const msg = document.createElement('div');
		msg.className = 'qatool-msg';
		msg.innerHTML = `<div>${escapeHtml(f.message)}</div><div><code>${escapeHtml(f.code)}</code></div>`;
		if (f.element && f.element.snippet) {
			const pre = document.createElement('pre');
			pre.textContent = f.element.snippet;
			pre.style.margin = '6px 0 0'; pre.style.fontSize = '11px'; pre.style.background = '#f6f7f7'; pre.style.padding = '6px'; pre.style.whiteSpace = 'pre-wrap';
			msg.appendChild(pre);
		}
		const action = document.createElement('div');
		if (f.patch && report.post_id) action.appendChild(renderPatchForm(report, f));
		row.append(sev, msg, action);
		return row;
	}

	function renderPatchForm(report, f) {
		const form = document.createElement('form');
		form.className = 'qatool-patch-form';
		form.onsubmit = (ev) => { ev.preventDefault(); submitPatch(report, f, form); };

		const input = document.createElement('input');
		input.type = 'text';
		input.placeholder = placeholderFor(f.patch.type);
		input.value = f.patch.value || f.patch.suggestion || '';

		const submit = document.createElement('button');
		submit.className = 'button';
		submit.type = 'submit';
		submit.textContent = 'Apply';

		const msg = document.createElement('span');
		msg.style.fontSize = '12px';
		msg.style.marginLeft = '6px';

		form.append(input, submit, msg);
		return form;
	}

	async function submitPatch(report, f, form) {
		const input = form.querySelector('input');
		const msg = form.querySelector('span');
		const submit = form.querySelector('button');
		submit.disabled = true;
		msg.textContent = 'Applying…';

		const verify = $('#qatool-verify')?.checked;
		const autoRevert = $('#qatool-auto-revert')?.checked;

		let beforeBase64 = null;
		if (verify && QATool.scannerBase) {
			try {
				msg.textContent = 'Capturing "before"…';
				beforeBase64 = await captureSnapshot(report.url, 'desktop');
			} catch (e) {
				msg.textContent = 'Snapshot failed — applying anyway.';
			}
		}

		try {
			const body = new FormData();
			body.append('action', 'qatool_patch');
			body.append('nonce', QATool.nonce);
			body.append('post_id', report.post_id);
			body.append('patch', JSON.stringify(f.patch));
			body.append('value', input.value);
			const res = await fetch(QATool.ajaxUrl, { method: 'POST', credentials: 'same-origin', body });
			const json = await res.json();
			if (!json.success) throw new Error(json.data || 'Patch failed');
			const entryId = json.data.history_id;
			msg.textContent = '✓ Applied';
			msg.style.color = '#006400';

			if (verify && beforeBase64 && QATool.scannerBase) {
				msg.textContent = 'Verifying…';
				try {
					const diff = await compare(report.url, beforeBase64, 'desktop');
					await attachVisual(report.post_id, entryId, diff.diffPercent, 'desktop');
					showDiffModal(report, entryId, diff, autoRevert);
					msg.textContent = `✓ Diff ${diff.diffPercent}%`;
				} catch (e) {
					msg.textContent = '✓ Applied (verify failed: ' + e.message + ')';
				}
			}
			// Refresh history section in background
			refreshHistory(report);
		} catch (e) {
			msg.textContent = '✗ ' + (e.message || e);
			msg.style.color = '#a62626';
		} finally {
			submit.disabled = false;
		}
	}

	async function captureSnapshot(url, viewport) {
		const res = await scannerFetch(`/api/snapshot?url=${encodeURIComponent(url)}&viewport=${viewport}`, { headers: { accept: 'application/json' } });
		if (!res.ok) throw new Error('snapshot http ' + res.status);
		const json = await res.json();
		if (!json.ok) throw new Error(json.error || 'snapshot failed');
		return json.png;
	}

	async function compare(url, beforeBase64, viewport) {
		const res = await scannerFetch(`/api/compare`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ url, beforePng: beforeBase64, viewport, fullPage: false })
		});
		if (!res.ok) throw new Error('compare http ' + res.status);
		const json = await res.json();
		if (!json.ok) throw new Error(json.error || 'compare failed');
		return json;
	}

	async function scannerFetch(path, init = {}) {
		if (!QATool.scannerBase) throw new Error('Set the QAtool endpoint in settings first.');
		const headers = Object.assign({}, init.headers || {});
		if (QATool.scannerApiKey) headers['x-qatool-key'] = QATool.scannerApiKey;
		return fetch(QATool.scannerBase + path, Object.assign({ mode: 'cors' }, init, { headers }));
	}

	async function attachVisual(postId, entryId, diffPercent, viewport) {
		const body = new FormData();
		body.append('action', 'qatool_attach_visual');
		body.append('nonce', QATool.nonce);
		body.append('post_id', postId);
		body.append('entry_id', entryId);
		body.append('diff_percent', diffPercent);
		body.append('viewport', viewport);
		await fetch(QATool.ajaxUrl, { method: 'POST', credentials: 'same-origin', body });
	}

	function showDiffModal(report, entryId, diff, autoRevert) {
		const modal = document.createElement('div');
		modal.className = 'qatool-modal';
		modal.innerHTML = `
			<div class="qatool-modal-inner">
				<h3>Visual diff — ${diff.diffPercent}% changed</h3>
				<div class="qatool-diff-grid">
					<figure><figcaption>Before</figcaption><img src="data:image/png;base64,${diff.beforePng}"/></figure>
					<figure><figcaption>After</figcaption><img src="data:image/png;base64,${diff.afterPng}"/></figure>
					<figure><figcaption>Diff</figcaption><img src="data:image/png;base64,${diff.diffPng}"/></figure>
				</div>
				<div class="qatool-modal-actions">
					<button class="button" data-act="keep">Keep</button>
					<button class="button button-link-delete" data-act="revert">Revert</button>
				</div>
			</div>`;
		document.body.appendChild(modal);
		const close = () => modal.remove();
		modal.querySelector('[data-act=keep]').onclick = close;
		modal.querySelector('[data-act=revert]').onclick = async () => {
			await revertEntry(report, entryId);
			close();
		};
		if (autoRevert && diff.diffPercent > (QATool.diffThreshold || 5)) {
			revertEntry(report, entryId).then(close);
		}
	}

	async function revertEntry(report, entryId) {
		const body = new FormData();
		body.append('action', 'qatool_revert');
		body.append('nonce', QATool.nonce);
		body.append('post_id', report.post_id);
		body.append('entry_id', entryId);
		const res = await fetch(QATool.ajaxUrl, { method: 'POST', credentials: 'same-origin', body });
		const json = await res.json();
		if (!json.success) { alert('Revert failed: ' + json.data); return; }
		refreshHistory(report);
	}

	function renderLinks(links) {
		const wrap = document.createElement('div');
		wrap.className = 'qatool-links';
		const broken = links.filter(l => !l.ok);
		const heading = document.createElement('div');
		heading.className = 'qatool-section-heading';
		heading.textContent = `Links: ${links.length - broken.length} ok · ${broken.length} broken / ${links.length}`;
		wrap.appendChild(heading);
		if (broken.length) {
			const ul = document.createElement('ul');
			ul.className = 'qatool-link-list';
			for (const l of broken.slice(0, 100)) {
				const li = document.createElement('li');
				li.innerHTML = `<span class="qatool-sev critical">${l.status || 'ERR'}</span> <a href="${escapeAttr(l.url)}" target="_blank" rel="noreferrer">${escapeHtml(l.url)}</a>${l.error ? ' <em>— ' + escapeHtml(l.error) + '</em>' : ''}`;
				ul.appendChild(li);
			}
			wrap.appendChild(ul);
		}
		return wrap;
	}

	function renderHistory(report) {
		const wrap = document.createElement('div');
		wrap.className = 'qatool-history';
		const heading = document.createElement('div');
		heading.className = 'qatool-section-heading';
		heading.textContent = 'Revert history';
		wrap.appendChild(heading);
		const list = document.createElement('ul');
		list.className = 'qatool-history-list';
		list.dataset.postId = report.post_id || '';
		wrap.appendChild(list);
		renderHistoryList(list, report.history || [], report);
		return wrap;
	}

	function refreshHistory(report) {
		const list = results.querySelector(`.qatool-history-list[data-post-id="${report.post_id}"]`);
		if (!list) return;
		const body = new FormData();
		body.append('action', 'qatool_history');
		body.append('nonce', QATool.nonce);
		body.append('post_id', report.post_id);
		fetch(QATool.ajaxUrl, { method: 'POST', credentials: 'same-origin', body })
			.then(r => r.json())
			.then(j => { if (j.success) renderHistoryList(list, j.data.history || [], report); });
	}

	function renderHistoryList(list, entries, report) {
		list.innerHTML = '';
		if (!entries.length) {
			list.innerHTML = '<li class="qatool-muted">No patches applied to this page yet.</li>';
			return;
		}
		for (const e of entries) {
			const li = document.createElement('li');
			const when = new Date((e.applied_at || 0) * 1000).toLocaleString();
			const before = truncate(JSON.stringify(e.before_value), 60);
			const after = truncate(JSON.stringify(e.after_value), 60);
			const reverted = e.reverted_at
				? `<span class="qatool-tag">reverted ${new Date(e.reverted_at * 1000).toLocaleString()}</span>`
				: '';
			const diffBadge = e.visual && e.visual.diff_percent !== undefined ? `<span class="qatool-tag">diff ${e.visual.diff_percent}%</span>` : '';
			li.innerHTML = `
				<div><strong>${escapeHtml(e.patch_type)}</strong> · ${escapeHtml(when)} ${reverted} ${diffBadge}</div>
				<div class="qatool-muted">target: ${escapeHtml(e.target || '')}</div>
				<div class="qatool-muted">before: <code>${escapeHtml(before)}</code> → after: <code>${escapeHtml(after)}</code></div>
			`;
			if (!e.reverted_at) {
				const rev = document.createElement('button');
				rev.className = 'button button-small';
				rev.textContent = 'Revert';
				rev.onclick = () => revertEntry(report, e.id);
				li.appendChild(rev);
			}
			list.appendChild(li);
		}
	}

	function placeholderFor(type) {
		switch (type) {
			case 'alt-text': return 'Descriptive alt text';
			case 'meta-title': return 'Page title (50–60 chars)';
			case 'meta-description': return 'Meta description (120–160 chars)';
			case 'canonical': return 'https://example.com/canonical';
			default: return 'Value';
		}
	}

	function truncate(s, n) {
		s = String(s ?? '');
		return s.length > n ? s.slice(0, n - 1) + '…' : s;
	}

	function escapeHtml(s) {
		return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
	}
	function escapeAttr(s) { return escapeHtml(s); }
})();
