(function () {
  var defaultLandingConfig = {
    stateName: "Alaska",
    stateResidents: "Alaskans",
    departmentName: "Alaska Department of Health",
    partnerName: "HALT (Health and Lifestyle Training)",
    campaignName: "Alaska's Fresh Start campaign website",
    departmentWebUrl:
      "https://health.alaska.gov/en/services/diabetes-prevention/",
    bloodPressureDepartmentWebUrl:
      "https://health.alaska.gov/en/services/self-measured-blood-pressure/",
    campaignWebUrl: "https://health.alaska.gov/en/services/fresh-start/",
    bloodPressureCampaignWebUrl:
      "https://health.alaska.gov/en/services/fresh-start/",
    bloodPressureCommunityProgramsHtml: "",
    supportEmail: "support@HALT360.org",
  };

  var cfg = Object.assign(
    {},
    defaultLandingConfig,
    window.LANDING_CONFIG || {},
  );

  document.querySelectorAll("[data-config-text]").forEach(function (el) {
    var key = el.getAttribute("data-config-text");
    if (cfg[key]) {
      el.textContent = cfg[key];
    }
  });

  document.querySelectorAll("[data-config-href]").forEach(function (el) {
    var key = el.getAttribute("data-config-href");
    if (cfg[key]) {
      el.setAttribute("href", cfg[key]);
    }
  });

  document.querySelectorAll("[data-config-mailto]").forEach(function (el) {
    var key = el.getAttribute("data-config-mailto");
    if (cfg[key]) {
      el.setAttribute("href", "mailto:" + cfg[key]);
      el.textContent = cfg[key];
    }
  });

  document.querySelectorAll("[data-config-html]").forEach(function (el) {
    var key = el.getAttribute("data-config-html");
    if (cfg[key]) {
      el.innerHTML = cfg[key];
    }
  });

  function bindGetStartedModal() {
    var button = document.getElementById("get-started");
    if (!button) {
      return;
    }

    button.addEventListener("click", function () {
      if (window.jQuery && window.jQuery.fn && window.jQuery.fn.modal) {
        window.jQuery("#inquiry-form").modal("show");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindGetStartedModal);
  } else {
    bindGetStartedModal();
  }
})();
