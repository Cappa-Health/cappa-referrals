/**
 * intake-shared.js
 * Shared modal and form-submission logic for all HALT intake landing pages.
 *
 * Requires auth-config.js to be loaded first (provides window.HALT_AUTH_CONFIG.intakeApiUrl).
 */

// ── Open modal ────────────────────────────────────────────────────────
document.getElementById("get-started").addEventListener("click", function () {
  window.jQuery("#inquiry-form").modal("show");
});

// ── Sync aria-hidden with modal visibility; reset form on close ────────
window
  .jQuery("#inquiry-form")
  .on("show.bs.modal", function () {
    window.jQuery(this).removeAttr("aria-hidden");
  })
  .on("hidden.bs.modal", function () {
    window.jQuery(this).attr("aria-hidden", "true");
    var successMsg = document.getElementById("form-success-msg");
    if (successMsg) successMsg.parentNode.removeChild(successMsg);
    var form = document.getElementById("intake-form");
    if (form) form.style.display = "";
  });

// ── Submit form via fetch → API Gateway → Lambda → SES ───────────────
(function () {
  var API_URL = (window.HALT_AUTH_CONFIG && window.HALT_AUTH_CONFIG.intakeApiUrl) || "";

  document
    .getElementById("intake-form")
    .addEventListener("submit", function (e) {
      e.preventDefault();

      var form = e.target;
      var submitBtn = form.querySelector('input[type="submit"]');
      var origVal = submitBtn.value;

      // Disable button while submitting
      submitBtn.disabled = true;
      submitBtn.value = "Submitting…";

      // Remove any previous error banner
      var prevErr = document.getElementById("form-error-msg");
      if (prevErr) {
        prevErr.parentNode.removeChild(prevErr);
      }

      var data = {
        name: form.querySelector('[name="program_intake[name]"]').value,
        email: form.querySelector('[name="program_intake[email]"]').value,
        phone: form.querySelector('[name="program_intake[phone]"]').value,
        zipcode: form.querySelector('[name="program_intake[zipcode]"]').value,
        motivation: form.querySelector('[name="program_intake[motivation]"]')
          .value,
        landing_page: form.querySelector(
          '[name="program_intake[landing_page]"]',
        ).value,
        state: form.querySelector('[name="program_intake[state]"]').value,
      };

      fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
        .then(function (response) {
          if (response.ok) {
            var successMsg = document.createElement("div");
            successMsg.id = "form-success-msg";
            successMsg.className = "alert alert-success";
            successMsg.setAttribute("role", "alert");
            successMsg.innerHTML =
              "<strong>Thank you!</strong> We received your information and a " +
              "team member will follow up with program details and your " +
              "potential start date.";
            form.parentNode.insertBefore(successMsg, form);
            form.style.display = "none";
          } else {
            throw new Error("Server returned " + response.status);
          }
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.value = origVal;
          var errMsg = document.createElement("p");
          errMsg.id = "form-error-msg";
          errMsg.setAttribute("role", "alert");
          errMsg.style.color = "#a94442";
          errMsg.textContent =
            "Something went wrong. Please try again or email support@HALT360.org.";
          form.appendChild(errMsg);
        });
    });
})();
