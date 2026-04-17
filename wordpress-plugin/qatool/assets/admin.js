(function () {
	const $ = (sel, root = document) => root.querySelector(sel);
	const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

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
			const res = await fetch(QATool.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: form });
			const json = await res.json();
			if (!json.success) throw new Error(json.data || 'Scan failed');
			renderReports(json.data.reports || [], json.data.seo_plugin);
			status.textContent = `Scanned ${json.data.reports.length} page(s).`;
		} catch (e) {
			status.textContent = 'Error: ' + (e.message || e);
		} finally {
			btn.disabled = false;
		}
	}

	function renderReports(reports, seoPlugin) {
		if (!reports.length) { results.innerHTML = '<p>No pages scanned.</p>'; return; }
		const frag = document.createDocumentFragment();
		for (const r of reports) frag.appendChild(renderReport(r, seoPlugin));
		results.appendChild(frag);
	}

	function renderReport(r, seoPlugin) {
		const wrap = document.createElement('div');
		wrap.className = 'qatool-report';

		const head = document.createElement('div');
		head.className = 'qatool-report-head';
		head.innerHTML = `
			<div>
				<h3>${escapeHtml(r.url)}</h3>
				<div>
					<span class="qatool-score">SEO ${r.score ? r.score.seo : '—'}</span>
					<span class="qatool-score">Resp ${r.score ? r.score.responsive : '—'}</span>
					${r.builder ? `<span class="qatool-tag">${escapeHtml(r.builder)}</span>` : ''}
					${r.post_id ? `<span class="qatool-tag">post #${r.post_id}</span>` : '<span class="qatool-tag">no WP match</span>'}
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
			for (const f of r.findings || []) body.appendChild(renderFinding(r, f, seoPlugin));
		}
		wrap.append(head, body);
		return wrap;
	}

	function renderFinding(report, f, seoPlugin) {
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
			pre.style.margin = '6px 0 0'; pre.style.fontSize = '11px'; pre.style.background = '#f6f7f7'; pre.style.padding = '6px';
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
			msg.textContent = '✓ Applied';
			msg.style.color = '#006400';
		} catch (e) {
			msg.textContent = '✗ ' + (e.message || e);
			msg.style.color = '#a62626';
		} finally {
			submit.disabled = false;
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

	function escapeHtml(s) {
		return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
	}
})();
