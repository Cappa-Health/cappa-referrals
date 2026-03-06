# cappalp.github.io

Landing Pages that are WCAG compliant

## White-label program landing config

The pages in `program_landings/` use a shared script at `program_landings/landing-config.js`.
Set `window.LANDING_CONFIG` before that script loads to customize content per state/department.

### Example override

```html
<script>
  window.LANDING_CONFIG = {
    stateName: "Arkansas",
    stateResidents: "Arkansans",
    departmentName: "Arkansas Department of Health",
    partnerName: "Healthy Lifestyle Training Team",
    campaignName: "Arkansas Fresh Start website",
    departmentWebUrl: "https://example.gov/diabetes-prevention",
    campaignWebUrl: "https://example.gov/fresh-start",
    supportEmail: "support@example.org",
  };
</script>
<script src="./landing-config.js"></script>
```

### Supported keys

- `stateName`
- `stateResidents`
- `departmentName`
- `partnerName`
- `campaignName`
- `departmentWebUrl`
- `campaignWebUrl`
- `supportEmail`
