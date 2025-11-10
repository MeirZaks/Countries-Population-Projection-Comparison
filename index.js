import express from "express";
import axios from "axios";
import fs from "fs";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

//parse the countries JSON
const jsonString = fs.readFileSync("public/JSONS/countries.json", "utf8");
const countriesJSON = JSON.parse(jsonString);

//initial page
app.get("/", async (req, res) => {
  res.render("index.ejs", { countryArray: countriesJSON.countries });
});

//submit and then render comparison
app.post("/submit", async (req, res) => {
  try {
    const part1 = req.body["SelectFirstCountry"];
    const part2 = req.body["SelectSecondCountry"];

    const country1Obj = countriesJSON.countries.find((c) => c.code === part1);
    const country2Obj = countriesJSON.countries.find((c) => c.code === part2);

    //handles input of same countries of user
    if (part1 === part2)
      res.render("index.ejs", {
        countryArray: countriesJSON.countries,
        error: "Please don't choose the same country twice.",
      });

    const country1Array = await getCountyArrays(req, res, part1);
    const country2Array = await getCountyArrays(req, res, part2);

    var country1 = {
      projections: combineIDandYear(
        country1Array.idArray,
        country1Array.yearArray
      ),
      name: part1,
    };

    var country2 = {
      projections: combineIDandYear(
        country2Array.idArray,
        country2Array.yearArray
      ),
      name: part2,
    };

    var yearAndPopulations = calculateProjections(country1, country2);

    res.render("index.ejs", {
      countryArray: countriesJSON.countries,
      country1Population: yearAndPopulations.country1Population,
      country2Population: yearAndPopulations.country2Population,
      year: yearAndPopulations.year,

      country1Name: country1Obj.name,
      country2Name: country2Obj.name,

      country1Flag: country1Obj.flag,
      country2Flag: country2Obj.flag,
    });
  } catch (error) {
    console.error("AXIOS ERROR:", error.message);
    res.render("index.ejs", {
      dataError: "An error occured. Please try a different set of countries",
    });
  }
});

function calculateProjections(country1, country2) {
  var projectionAmount = country1.projections.length;

  if (country1.projections.length < country2.projections.length)
    projectionAmount = country1.projections.length;
  else projectionAmount = country2.projections.length;

  var lastGrowthRate1 =
    100 +
    Math.round(
      (100 -
        (country1.projections[projectionAmount - 2].population * 100) /
          country1.projections[projectionAmount - 1].population) *
        100
    ) /
      100;
  var lastGrowthRate2 =
    100 +
    Math.round(
      (100 -
        (country2.projections[projectionAmount - 2].population * 100) /
          country2.projections[projectionAmount - 1].population) *
        100
    ) /
      100;

  var yearAndPopulations = {
    country1Population: country1.projections[projectionAmount - 1].population,
    country2Population: country2.projections[projectionAmount - 1].population,
    year: 2024,
  };

  switch (true) {
    case country1.projections[0].population <
      country2.projections[0].population:
      for (var i = 0; i < projectionAmount; i++) {
        if (
          country1.projections[i].population >
          country2.projections[i].population
        ) {
          yearAndPopulations.country1Population =
            country1.projections[i].population;
          yearAndPopulations.country2Population =
            country2.projections[i].population;
          yearAndPopulations.year = country1.projections[i].year;

          return yearAndPopulations;
        }
      }

      if (lastGrowthRate1 > lastGrowthRate2) {
        yearAndPopulations = calculateFutureProjectory(
          country1,
          country2,
          lastGrowthRate1,
          lastGrowthRate2,
          projectionAmount
        );
      }
      return yearAndPopulations;
      break;

    case country1.projections[0].population >
      country2.projections[0].population:
      for (var i = 0; i < projectionAmount; i++) {
        if (
          country1.projections[i].population <
          country2.projections[i].population
        ) {
          yearAndPopulations.country1Population =
            country1.projections[i].population;
          yearAndPopulations.country2Population =
            country2.projections[i].population;
          yearAndPopulations.year = country1.projections[i].year;

          return yearAndPopulations;
        }
      }

      if (lastGrowthRate1 < lastGrowthRate2) {
        yearAndPopulations = calculateFutureProjectory(
          country1,
          country2,
          lastGrowthRate1,
          lastGrowthRate2,
          projectionAmount
        );
      }
      return yearAndPopulations;
      break;

    default:
      break;
  }
}

//calculate future projections
function calculateFutureProjectory(
  country1,
  country2,
  growthRate1,
  growthRate2,
  projectionAmount
) {
  var country1Population =
    country1.projections[projectionAmount - 1].population;

  var country2Population =
    country2.projections[projectionAmount - 1].population;

  var year = country1.projections[projectionAmount - 1].year;

  switch (true) {
    case growthRate1 > growthRate2:
      while (country1Population < country2Population) {
        country1Population = Math.round(
          (country1Population * growthRate1) / 100
        );
        country2Population = Math.round(
          (country2Population * growthRate2) / 100
        );
        year++;
      }
      break;

    case growthRate1 < growthRate2:
      while (country1Population > country2Population) {
        country1Population = Math.round(
          (country1Population * growthRate1) / 100
        );
        country2Population = Math.round(
          (country2Population * growthRate2) / 100
        );
        year++;
      }
      break;

    default:
      break;
  }

  var yearAndPopulations = {
    country1Population: country1Population,
    country2Population: country2Population,
    year: year,
  };
  return yearAndPopulations;
}

//retrives information from the OECD API - https://data-explorer.oecd.org/vis?lc=en&df[ds]=dsDisseminateFinalDMZ&df[id]=DSD_POPULATION%40DF_POP_PROJ&df[ag]=OECD.ELS.SAE&df[vs]=&pd=%2C&dq=.POP.PS._T._T.&ly[cl]=TIME_PERIOD&to[TIME_PERIOD]=false&vw=tb
async function getCountyArrays(req, res, countryName) {
  try {
    const ret = await axios.get(
      `https://sdmx.oecd.org/public/rest/data/OECD.ELS.SAE,DSD_POPULATION@DF_POP_PROJ/${countryName}.POP.PS._T._T./all?format=jsondata`,
      {
        timeout: 30000,
        family: 4,
      }
    );

    return {
      idArray: Object.values(
        ret.data.data.dataSets[0].series["0:0:0:0:0:0"].observations
      ),
      yearArray: Object.values(
        ret.data.data.structures[0].dimensions.observation[0].values
      ),
    };
  } catch (error) {
    console.error("AXIOS ERROR:", error.message);
    res.render("index.ejs", {
      dataError: "Too many requests. Please try again soon.",
    });
  }
}

//API gives two arrays - years and population.
//The arrays have the order of the year and population matching,
//but the overall order is random. This function organizes it.
function combineIDandYear(idArray, yearArray) {
  var combinedArray = [];
  var holder = 0;

  for (var i = 0; i < yearArray.length; i++) {
    var min = 10000;
    for (var j = 0; j < yearArray.length; j++)
      if (yearArray[j].id < min) {
        min = yearArray[j].id;
        holder = idArray[j][0];
      }

    for (var j = 0; j < yearArray.length; j++)
      if (yearArray[j].id == min) yearArray[j].id = 9999;

    var combinedValue = {
      year: min,
      population: holder,
    };

    combinedArray.push(combinedValue);
  }

  return combinedArray;
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
