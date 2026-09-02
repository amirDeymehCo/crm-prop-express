function splitInstallmentAmount({
  totalBaseUsd,
  totalBaseIrr,
  totalInsuranceUsd,
  totalInsuranceIrr,
}) {
  const firstBaseUsd = Number((totalBaseUsd / 2).toFixed(2));
  const secondBaseUsd = Number((totalBaseUsd - firstBaseUsd).toFixed(2));

  const firstInsuranceUsd = Number((totalInsuranceUsd / 2).toFixed(2));
  const secondInsuranceUsd = Number(
    (totalInsuranceUsd - firstInsuranceUsd).toFixed(2),
  );

  const firstBaseIrr = Math.floor(totalBaseIrr / 2);
  const secondBaseIrr = totalBaseIrr - firstBaseIrr;

  const firstInsuranceIrr = Math.floor(totalInsuranceIrr / 2);
  const secondInsuranceIrr = totalInsuranceIrr - firstInsuranceIrr;

  return {
    first: {
      baseUsd: firstBaseUsd,
      baseIrr: firstBaseIrr,
      insuranceUsd: firstInsuranceUsd,
      insuranceIrr: firstInsuranceIrr,
      totalUsd: Number((firstBaseUsd + firstInsuranceUsd).toFixed(2)),
      totalIrr: firstBaseIrr + firstInsuranceIrr,
    },

    second: {
      baseUsd: secondBaseUsd,
      baseIrr: secondBaseIrr,
      insuranceUsd: secondInsuranceUsd,
      insuranceIrr: secondInsuranceIrr,
      totalUsd: Number((secondBaseUsd + secondInsuranceUsd).toFixed(2)),
      totalIrr: secondBaseIrr + secondInsuranceIrr,
    },
  };
}

module.exports = splitInstallmentAmount;
