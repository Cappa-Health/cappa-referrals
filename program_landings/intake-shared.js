/**
 * intake-shared.js
 * Shared modal and form-submission logic for all HALT intake landing pages.
 *
 * Each page must define window.HALT_INTAKE_API_URL before loading this file:
 *   <script>window.HALT_INTAKE_API_URL = "https://api.example.com/program-intake";</script>
 *   <script src="/program_landings/intake-shared.js"></script>
 */

// ── Open modal ────────────────────────────────────────────────────────
document.getElementById("get-started").addEventListener("click", function () {
  window.jQuery("#inquiry-form").modal("show");
});

// ── Sync aria-hidden with modal visibility ─────────────────────────────
window
  .jQuery("#inquiry-form")
  .on("show.bs.modal", function () {
    window.jQuery(this).removeAttr("aria-hidden");
  })
  .on("hidden.bs.modal", function () {
    window.jQuery(this).attr("aria-hidden", "true");
  });

// ── Submit form via fetch → API Gateway → Lambda → SES ───────────────
(function () {
  var API_URL = window.HALT_INTAKE_API_URL || "";

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
            // Replace form with success message
            form.innerHTML =
              '<div class="alert alert-success" role="alert">' +
              "<strong>Thank you!</strong> We received your information and a " +
              "team member will follow up with program details and your " +
              "potential start date." +
              "</div>";
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
