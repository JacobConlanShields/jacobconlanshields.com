(function () {
  function hasGtag() {
    return typeof window.gtag === "function";
  }

  function trackEvent(eventName, params) {
    if (!eventName || !hasGtag()) return;
    window.gtag("event", eventName, {
      page_location: window.location.href,
      page_path: window.location.pathname,
      page_title: document.title,
      ...(params || {})
    });
  }

  function trackPageView(eventName, pageName) {
    trackEvent(eventName, {
      page_name: pageName || document.title
    });
  }

  function wireDeclarativeEvents() {
    document.addEventListener("click", function (event) {
      const target = event.target.closest("[data-ga-event]");
      if (!target) return;

      trackEvent(target.dataset.gaEvent, {
        element_type: target.tagName.toLowerCase(),
        element_text: (target.dataset.gaLabel || target.textContent || "").trim().slice(0, 120),
        link_url: target.getAttribute("href") || ""
      });
    });
  }

  window.JCSAnalytics = {
    trackEvent,
    trackPageView,
    wireDeclarativeEvents
  };

  wireDeclarativeEvents();
})();
