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
    weightLossDepartmentWebUrl:
      "https://health.alaska.gov/en/services/diabetes-prevention/",
    bloodSugarDepartmentWebUrl:
      "https://health.alaska.gov/en/services/diabetes-education-support/",
    campaignWebUrl: "https://health.alaska.gov/en/services/fresh-start/",
    bloodPressureCampaignWebUrl:
      "https://health.alaska.gov/en/services/fresh-start/",
    weightLossCampaignWebUrl:
      "https://health.alaska.gov/en/services/fresh-start/",
    bloodSugarCampaignWebUrl:
      "https://health.alaska.gov/en/services/fresh-start/",
    bloodPressureCommunityLocations: [
      {
        city: "Anchorage",
        providers: [
          {
            name: "Anchorage Neighborhood Health Center",
            details:
              "Valerie Bixler, PharmD, BC-ADM, Clinical Pharmacist Phone: 907-743-7203 Spanish: Yes Programs: SMBP, DSMES, DPP",
          },
          {
            name: "Pacific Community of Alaska",
            details:
              "Designed for Native Hawaiian Pacific Islander population Mavis Boone Phone: 907-891-9996 Program: SMBP",
          },
          {
            name: "Providence Medical Center Community Health Workers",
            details: "Cynthia Lyell Phone: 907-201-0182 Program: SMBP",
          },
          {
            name: "YMCA Anchorage",
            details:
              "Erin Widener Phone: 907-563-3211 ext. 104 Spanish: Yes Program: SMBP",
          },
        ],
      },
      {
        city: "Cordova",
        providers: [
          {
            name: "Ilanka Community Health Center",
            details: "Ellen Sheridan RN, CCM Phone: 907-424-8257 Program: SMBP",
          },
        ],
      },
      {
        city: "Haines",
        providers: [
          {
            name: "Southeast Alaska Regional Health Consortium",
            details:
              "Genevieve Schmidt Phone: 907-463-7507 Programs: SMBP, DPP, DSMES",
          },
        ],
      },
      {
        city: "Juneau",
        providers: [
          {
            name: "Southeast Alaska Regional Health Consortium (SEARHC)",
            details:
              "Genevieve Schmidt Phone: 907-463-7507 Programs: SMBP, DPP, DSMES",
          },
        ],
      },
      {
        city: "Nome",
        providers: [
          {
            name: "Norton Sound Health Corporation",
            details:
              "Megan C. Mackiernan, PA-C Phone: 907-443-4501 Program: SMBP",
          },
        ],
      },
      {
        city: "Northern Mat-Su Valley",
        providers: [
          {
            name: "Sunshine Community Health Center",
            details:
              "Duronda Twigg, BSN, RN Phone: 907-733-2273 ext. 2830 Program: SMBP",
          },
        ],
      },
      {
        city: "Sitka",
        providers: [
          {
            name: "Southeast Alaska Regional Health Consortium",
            details:
              "Genevieve Schmidt Phone: 907-463-7507 Programs: SMBP, DPP, DSMES",
          },
        ],
      },
      {
        city: "Talkeetna",
        providers: [
          {
            name: "Sunshine Community Health Center",
            details:
              "Duronda Twigg, BSN, RN Phone: 907-733-2273 ext. 2830 Program: SMBP",
          },
        ],
      },
      {
        city: "Tyonek",
        providers: [
          {
            name: "Native Village of Tyonek",
            details:
              "Administered through EMS department Justin Trenton Phone: 907-583-2201 Program: SMBP",
          },
        ],
      },
      {
        city: "Unalaska",
        providers: [
          {
            name: "Qawalangin Tribe of Unalaska",
            details: "Kate Arduser Phone: 907-581-2920 Program: SMBP",
          },
        ],
      },
      {
        city: "Willow",
        providers: [
          {
            name: "Sunshine Community Health Center",
            details:
              "Duronda Twigg, BSN, RN Phone: 907-733-2273 ext. 2830 Program: SMBP",
          },
        ],
      },
      {
        city: "Wrangell",
        providers: [
          {
            name: "Southeast Alaska Regional Health Consortium",
            details: "Genevieve Schmidt Phone: 907-463-7507 Program: SMBP",
          },
        ],
      },
    ],
    weightLossCommunityLocations: [
      {
        city: "Anchorage",
        providers: [
          {
            name: "Anchorage Neighborhood Health Center",
            details:
              "4951 Business Park Blvd. Anchorage, AK 99503 Phone: 907-743-7200 Spanish: Yes Programs: DPP, DSMES, SMBP",
          },
          {
            name: "Southcentral Foundation",
            details:
              "Diabetes Education Program 4320 Diplomacy Drive, Suite 1121 Anchorage, AK 99508 Phone: 907-729-4380 Programs: DPP, DSMES",
          },
          {
            name: "YMCA of Anchorage",
            details:
              "5323 Lake Otis Parkway Anchorage, AK 99507 Phone: 907-563-3211 Ext: 104 Program: DPP",
          },
        ],
      },
      {
        city: "Bethel",
        providers: [
          {
            name: "Yukon Kuskokwim Health Corporation",
            details:
              "Diabetes Prevention and Control Program PO Box 528 Bethel, AK 99559 Phone: 907-543-6049 Programs: DPP, Healthy Living, DSMES",
          },
        ],
      },
      {
        city: "Fairbanks",
        providers: [
          {
            name: "Tanana Chiefs Conference",
            details:
              "Chief Andrew Isaac Health Center 1717 West Cowles Street Fairbanks, AK 99701 Phone: 907-451-6682, Ext: 3768 Program: DPP",
          },
          {
            name: "University of Alaska Fairbanks Cooperative Extension Service",
            details:
              "Tanana District Office Diabetes Prevention Program 1000 University Avenue Fairbanks, AK 99709 Phone: 907-474-2426 Program: DPP",
          },
        ],
      },
      {
        city: "Haines",
        providers: [
          {
            name: "Southeast Regional Health Consortium (SEARHC)",
            details:
              "Haines Health Center 131 1st Avenue, Haines, AK 99827 Phone: 907-766-6300 Programs: DPP, DSMES, SMBP",
          },
        ],
      },
      {
        city: "Homer",
        providers: [
          {
            name: "Seldovia Village Tribe",
            details:
              "880 East End Road Homer, AK 99603 Phone: 907-226-2228 Programs: DPP, SMBP",
          },
        ],
      },
      {
        city: "Juneau",
        providers: [
          {
            name: "Southeast Regional Health Consortium (SEARHC)",
            details:
              "Ethel Lund Medical Center 1200 Salmon Creek Lane Juneau, AK 99801 Phone: 907-463-4040 Programs: DPP, DSMES, SMBP",
          },
        ],
      },
      {
        city: "Kenai",
        providers: [
          {
            name: "Kenaitze Indian Tribe",
            details:
              "508 Upland Street Kenai, AK 99611 Phone: 907-335-7582 Program: Healthy Living",
          },
        ],
      },
      {
        city: "Ketchikan",
        providers: [
          {
            name: "Ketchikan Indian Community",
            details:
              "2960 Tongass Ave. Ketchikan, AK 99901 Phone: 907-228-9428 Programs: Healthy Living, DSMES",
          },
        ],
      },
      {
        city: "Kotzebue",
        providers: [
          {
            name: "Maniilaq Association",
            details:
              "733 2nd Avenue Kotzebue, AK 99752 Phone: 907-442-7455 Program: DPP",
          },
        ],
      },
      {
        city: "Sitka",
        providers: [
          {
            name: "Southeast Regional Health Consortium (SEARHC)",
            details:
              "Mt. Edgecumbe Medical Center 222 Tongass Drive Sitka, AK 99835 Phone: 907-966-2411 Programs: DPP, DSMES, SMBP",
          },
        ],
      },
      {
        city: "Soldotna",
        providers: [
          {
            name: "Central Peninsula Hospital",
            details:
              "250 Hospital Place Soldotna, AK 99669 Phone: 907-714-4404 Programs: Healthy Living, DSMES",
          },
        ],
      },
      {
        city: "Wasilla",
        providers: [
          {
            name: "Capstone Clinic",
            details:
              "3122 E Meridian Park Loop Wasilla, AK 99654 Phone: 907-357-9590 Programs: Healthy Living, DSMES",
          },
        ],
      },
    ],
    bloodSugarCommunityLocations: [
      {
        city: "Anchorage",
        providers: [
          {
            name: "Anchorage Neighborhood Health Center",
            details:
              "4951 Business Park Blvd. Anchorage, AK 99503 Phone: 907-743-7200 Spanish: Yes Programs: DSMES, DPP, SMBP",
          },
          {
            name: "Providence Alaska Medical Center",
            details:
              "Providence Diabetes and Nutrition Center 3340 Providence Drive, A Tower Suite A453 Anchorage, AK 99508 Phone: 907-212-7980 Spanish: Yes Program: DSMES",
          },
          {
            name: "Southcentral Foundation",
            details:
              "Diabetes Education Program 4320 Diplomacy Drive, Suite 1121 Anchorage, AK 99508 Phone: 907-729-4380 Programs: DSMES, DPP",
          },
        ],
      },
      {
        city: "Bethel",
        providers: [
          {
            name: "Yukon Kuskokwim Health Corporation",
            details:
              "Diabetes Prevention and Control Program PO Box 528 Bethel, AK 99559 Phone: 907-543-6049 Programs: DSMES, DPP, Healthy Living",
          },
        ],
      },
      {
        city: "Fairbanks",
        providers: [
          {
            name: "Tanana Valley Clinic",
            details:
              "Diabetes and Nutrition Education Center 1001 Noble Street, Suite 450 Fairbanks, AK 99701 Phone: 907-458-2676 Spanish: Yes Program: DSMES",
          },
          {
            name: "Fairbanks Memorial Hospital",
            details:
              "1650 Cowles Street Fairbanks, AK 99701 Phone: 907-452-8181 Program: DSMES",
          },
        ],
      },
      {
        city: "Haines",
        providers: [
          {
            name: "Southeast Regional Health Consortium (SEARHC)",
            details:
              "Haines Health Center 131 1st Avenue Haines, AK 99827 Phone: 907-766-6300 Programs: DSMES, DPP, SMBP",
          },
        ],
      },
      {
        city: "Homer",
        providers: [
          {
            name: "Seldovia Village Tribe",
            details:
              "880 East End Road Homer, AK 99603 Phone: 907-226-2228 Programs: DPP, SMBP",
          },
        ],
      },
      {
        city: "Juneau",
        providers: [
          {
            name: "Southeast Regional Health Consortium (SEARHC)",
            details:
              "Ethel Lund Medical Center 1200 Salmon Creek Lane Juneau, AK 99801 Phone: 907-463-4040 Programs: DSMES, DPP, SMBP",
          },
        ],
      },
      {
        city: "Kenai",
        providers: [
          {
            name: "Kenaitze Indian Tribe",
            details:
              "508 Upland Street Kenai, AK 99611 Phone: 907-335-7582 Program: Healthy Living",
          },
        ],
      },
      {
        city: "Ketchikan",
        providers: [
          {
            name: "Ketchikan Indian Community",
            details:
              "2960 Tongass Ave Ketchikan, AK 99901 Phone: 907-228-9428 Programs: DSMES, Healthy Living",
          },
        ],
      },
      {
        city: "Kodiak",
        providers: [
          {
            name: "Kodiak Community Health Center",
            details:
              "1911 E Rezanof Drive Kodiak, AK 99615 Phone: 907-481-5000 Program: DSMES",
          },
        ],
      },
      {
        city: "Kotzebue",
        providers: [
          {
            name: "Maniilaq Association",
            details:
              "733 2nd Avenue Kotzebue, AK 99752 Phone: 907-442-7455 Program: DPP",
          },
        ],
      },
      {
        city: "Sitka",
        providers: [
          {
            name: "Southeast Regional Health Consortium (SEARHC)",
            details:
              "Mt. Edgecumbe Medical Center 222 Tongass Drive Sitka, AK 99835 Phone: 907-966-2411 Programs: DSMES, DPP, SMBP",
          },
        ],
      },
      {
        city: "Soldotna",
        providers: [
          {
            name: "Central Peninsula Hospital",
            details:
              "250 Hospital Place Soldotna, AK 99669 Phone: 907-714-4404 Programs: DSMES, Healthy Living",
          },
        ],
      },
      {
        city: "Wasilla",
        providers: [
          {
            name: "Capstone Clinic",
            details:
              "3122 E Meridian Park Loop Wasilla, AK 99654 Phone: 907-357-9590 Programs: DSMES, Healthy Living",
          },
        ],
      },
    ],
    supportEmail: "support@HALT360.org",
    sealImageSrc: "../assets/images/alaska-doh-fresh-start.png",
    sealImageAlt:
      "Alaska Department of Health seal and Fresh Start campaign logos",
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

  document.querySelectorAll("[data-config-src]").forEach(function (el) {
    var key = el.getAttribute("data-config-src");
    if (cfg[key]) {
      el.setAttribute("src", cfg[key]);
    }
  });

  document.querySelectorAll("[data-config-alt]").forEach(function (el) {
    var key = el.getAttribute("data-config-alt");
    if (cfg[key]) {
      el.setAttribute("alt", cfg[key]);
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

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function buildAccordion(locations, el) {
    var accordionId = el.id || "accordion";
    el.innerHTML = locations
      .map(function (loc) {
        var safeId = loc.city.replace(/[^a-zA-Z0-9]/g, "");
        var headingId = "heading" + safeId;
        var collapseId = "collapse" + safeId;
        var bodyHtml = loc.providers
          .map(function (p) {
            return (
              "<strong>" + escHtml(p.name) + "</strong>\n" + escHtml(p.details)
            );
          })
          .join("\n\n");
        return (
          '<div class="panel panel-default">' +
          '<div class="panel-heading" id="' +
          headingId +
          '">' +
          '<h4 class="panel-title">' +
          '<a class="collapsed" role="button" data-toggle="collapse"' +
          ' data-parent="#' +
          accordionId +
          '"' +
          ' href="#' +
          collapseId +
          '"' +
          ' aria-expanded="false"' +
          ' aria-controls="' +
          collapseId +
          '">' +
          "<strong>" +
          escHtml(loc.city) +
          "</strong>" +
          "</a>" +
          "</h4>" +
          "</div>" +
          '<div id="' +
          collapseId +
          '" class="panel-collapse collapse"' +
          ' aria-labelledby="' +
          headingId +
          '">' +
          '<div class="panel-body" style="white-space: pre-wrap">' +
          bodyHtml +
          "</div>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  document.querySelectorAll("[data-config-locations]").forEach(function (el) {
    var key = el.getAttribute("data-config-locations");
    if (cfg[key] && cfg[key].length) {
      buildAccordion(cfg[key], el);
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
