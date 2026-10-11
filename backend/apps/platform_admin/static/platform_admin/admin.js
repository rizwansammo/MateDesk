/* MateDesk Platform Admin — JavaScript */

// ── Flash Message Auto-Dismiss ────────────────────────────────
(function () {
  'use strict';

  function initFlashMessages() {
    var flashes = document.querySelectorAll('.flash');
    flashes.forEach(function (el) {
      // Close button
      var btn = el.querySelector('.flash-close');
      if (btn) {
        btn.addEventListener('click', function () {
          dismissFlash(el);
        });
      }
      // Auto dismiss after 5 seconds
      setTimeout(function () {
        dismissFlash(el);
      }, 5000);
    });
  }

  function dismissFlash(el) {
    el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 320);
  }

  // ── Tab Switching ───────────────────────────────────────────
  function initTabs() {
    // Support multiple independent tab groups on the same page.
    var groups = document.querySelectorAll('[data-tab-container]');

    groups.forEach(function (container) {
      var btns = container.querySelectorAll('[data-tab-target]');

      function activateTab(targetId) {
        // Hide every panel that belongs to this group (resolved via button targets,
        // NOT via querySelectorAll inside the nav — panels are siblings, not children).
        btns.forEach(function (b) {
          b.classList.remove('active');
          var panel = document.getElementById(b.getAttribute('data-tab-target'));
          if (panel) panel.classList.remove('active');
        });

        // Show the requested tab + panel.
        btns.forEach(function (b) {
          if (b.getAttribute('data-tab-target') === targetId) b.classList.add('active');
        });
        var target = document.getElementById(targetId);
        if (target) target.classList.add('active');

        // Reflect in URL without reload.
        try {
          var url = new URL(window.location.href);
          url.searchParams.set('tab', targetId);
          window.history.replaceState({}, '', url.toString());
        } catch (err) { /* ignore */ }
      }

      btns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          activateTab(btn.getAttribute('data-tab-target'));
        });
      });

      // Restore tab from URL param, or default to first.
      try {
        var urlParams = new URLSearchParams(window.location.search);
        var activeTab = urlParams.get('tab');
        var found = activeTab && container.querySelector('[data-tab-target="' + activeTab + '"]');
        if (found) {
          activateTab(activeTab);
        } else if (btns.length) {
          activateTab(btns[0].getAttribute('data-tab-target'));
        }
      } catch (err) { /* ignore */ }
    });
  }

  // ── Slug Auto-Derive ────────────────────────────────────────
  function initSlugDerive() {
    var nameInput = document.getElementById('id-name');
    var slugInput = document.getElementById('id-slug');
    if (!nameInput || !slugInput) return;

    var userEditedSlug = false;
    slugInput.addEventListener('input', function () {
      userEditedSlug = true;
    });

    nameInput.addEventListener('input', function () {
      if (userEditedSlug) return;
      var slug = nameInput.value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 63);
      slugInput.value = slug;
    });
  }

  // ── Mobile Sidebar Toggle ───────────────────────────────────
  function initMobileSidebar() {
    var toggleBtn = document.getElementById('mobile-menu-btn');
    var sidebar = document.querySelector('.sidebar');
    var overlay = document.getElementById('sidebar-overlay');

    if (!toggleBtn || !sidebar) return;

    toggleBtn.addEventListener('click', function () {
      sidebar.classList.toggle('open');
      if (overlay) overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
    });

    if (overlay) {
      overlay.addEventListener('click', function () {
        sidebar.classList.remove('open');
        overlay.style.display = 'none';
      });
    }
  }

  // ── Confirmation Modal ──────────────────────────────────────
  function initConfirmModal() {
    var modal = document.getElementById('confirm-modal');
    if (!modal) return;

    var titleEl = modal.querySelector('#confirm-modal-title');
    var bodyEl  = modal.querySelector('#confirm-modal-body');
    var cancelBtn = modal.querySelector('#confirm-modal-cancel');
    var confirmBtn = modal.querySelector('#confirm-modal-confirm');
    var pendingForm = null;

    window.showConfirm = function (opts) {
      if (titleEl) titleEl.textContent = opts.title || 'Confirm Action';
      if (bodyEl)  bodyEl.textContent  = opts.body  || 'Are you sure you want to proceed?';

      if (confirmBtn) {
        confirmBtn.textContent = opts.confirmLabel || 'Confirm';
        confirmBtn.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
      }

      pendingForm = opts.form || null;
      modal.classList.add('open');
    };

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        modal.classList.remove('open');
        pendingForm = null;
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        modal.classList.remove('open');
        if (pendingForm) {
          // form.submit() does not fire the 'submit' event, so show manually.
          if (window._ptoShow) window._ptoShow();
          pendingForm.submit();
          pendingForm = null;
        }
      });
    }

    // Close on overlay click
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        modal.classList.remove('open');
        pendingForm = null;
      }
    });

    // Wire up all data-confirm forms
    document.querySelectorAll('[data-confirm]').forEach(function (el) {
      el.addEventListener('submit', function (e) {
        e.preventDefault();
        var form = this;
        showConfirm({
          title: form.getAttribute('data-confirm-title') || 'Confirm Action',
          body: form.getAttribute('data-confirm') || 'Are you sure?',
          confirmLabel: form.getAttribute('data-confirm-btn') || 'Confirm',
          danger: form.hasAttribute('data-confirm-danger'),
          form: form,
        });
      });
    });
  }

  // ── Plan Change Select ──────────────────────────────────────
  function initPlanChangeForm() {
    var form = document.getElementById('plan-change-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var sel = form.querySelector('select[name="plan"]');
      var newPlan = sel ? sel.options[sel.selectedIndex].text : 'the new plan';
      showConfirm({
        title: 'Change Subscription Plan',
        body: 'Change this tenant\'s plan to ' + newPlan + '? This will take effect immediately.',
        confirmLabel: 'Change Plan',
        danger: false,
        form: form,
      });
    });
  }

  // ── Profile Panel ───────────────────────────────────────────
  function initProfilePanel() {
    var avatarBtn = document.getElementById('topbar-avatar');
    var panel     = document.getElementById('profile-panel');
    var overlay   = document.getElementById('profile-panel-overlay');

    if (!avatarBtn || !panel) return;

    function openPanel() {
      panel.classList.add('open');
      if (overlay) overlay.classList.add('open');
    }

    function closePanel() {
      panel.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
    }

    avatarBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.classList.contains('open')) {
        closePanel();
      } else {
        openPanel();
      }
    });

    if (overlay) {
      overlay.addEventListener('click', closePanel);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePanel();
    });
  }

  // ── Init all on DOMContentLoaded ───────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    initFlashMessages();
    initTabs();
    initSlugDerive();
    initMobileSidebar();
    initConfirmModal();
    initPlanChangeForm();
    initProfilePanel();
  });
})();
