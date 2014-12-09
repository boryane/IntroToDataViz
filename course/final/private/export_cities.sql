USE playground
GO
/*
Downloaded data from: http://geonames.usgs.gov/docs/stategaz/NationalFile_20141005.zip
Definitions at: http://geonames.usgs.gov/domestic/states_fileformat.htm
*/

SET NOCOUNT ON

IF NOT EXISTS ( SELECT  1
            FROM    Information_schema.Routines
            WHERE   Specific_schema = 'dbo'
                    AND specific_name = 'fx_HasNonAlphaCharacters'
                    AND Routine_Type = 'FUNCTION' ) BEGIN

	DECLARE @sql nvarchar(max)
	SET @sql = 'CREATE FUNCTION [dbo].[fx_HasNonAlphaCharacters]
	(@temp nvarchar(1000))
	RETURNS bit
	AS
	BEGIN
		DECLARE @has_nonalpha bit = 0
		
		SELECT @has_nonalpha = 1
		WHERE @temp LIKE ''%[^a-z0-9 !-&]%'' ESCAPE ''!''
		
		RETURN @has_nonalpha
	END'
	EXEC sp_executesql @sql

END

DECLARE @cities table
(
	id int,
	city varchar(100),
	[state] varchar(2),
	latitude decimal(12,7),
	longitude decimal(13,7),
	PRIMARY KEY ([id])
)
DECLARE @json nvarchar(max)

;WITH cities AS
	(
	SELECT 
		[id],
		CASE
			-- clean-up of AK cities
			WHEN city LIKE '% [A-Za-z]-[0-9]' THEN REPLACE(SUBSTRING(city, 1, LEN(city)-4), ' D-1 &', '')
			ELSE city
		END as city,
		city as original_city_name,
		county,
		[state],
		latitude,
		longitude
	FROM
		(	
		SELECT 
			[id],
			--principal_name as city,
			secondary_name as city,
			county,
			[state],
			latitude,
			longitude,
			-- rank cities higher that have the same feature_name as principal name
			ROW_NUMBER() OVER (PARTITION BY secondary_name, county, [state] ORDER BY is_principal DESC) as [rank]
		FROM
			(
			SELECT 
				FEATURE_ID as [id],
				MAP_NAME as principal_name,
				CASE
					WHEN dbo.fx_HasNonAlphaCharacters(FEATURE_NAME) = 1 THEN MAP_NAME
					ELSE FEATURE_NAME
				END as secondary_name,
				COUNTY_NAME as county,
				STATE_ALPHA as [state],
				PRIM_LAT_DEC as latitude,
				PRIM_LONG_DEC as longitude,
				CASE
					WHEN FEATURE_NAME = MAP_NAME THEN 1
					ELSE 0
				END as is_principal
			FROM us_areas_latlong
			WHERE
				FEATURE_CLASS IN ('Populated Place')
				AND (
					FEATURE_NAME NOT LIKE ('% (historical)')
					AND FEATURE_NAME NOT LIKE ('% Mobile %')
					AND FEATURE_NAME NOT LIKE ('%Trailer %')
					AND FEATURE_NAME NOT LIKE ('% Acres')
					AND FEATURE_NAME NOT LIKE ('% Addition%')
					AND FEATURE_NAME NOT LIKE ('% Business Park')
					AND FEATURE_NAME NOT LIKE ('% Camp')
					AND FEATURE_NAME NOT LIKE ('% Club')
					AND FEATURE_NAME NOT LIKE ('% Colonia')
					AND FEATURE_NAME NOT LIKE ('% Community')
					AND FEATURE_NAME NOT LIKE ('% Condominium%')
					AND FEATURE_NAME NOT LIKE ('% Development%')
					AND FEATURE_NAME NOT LIKE ('% Estates')
					AND FEATURE_NAME NOT LIKE ('% Center')
					AND FEATURE_NAME NOT LIKE ('% Colony')
					AND FEATURE_NAME NOT LIKE ('% Condo')
					AND FEATURE_NAME NOT LIKE ('%Cross Roads%')
					AND FEATURE_NAME NOT LIKE ('% Farm_')
					AND FEATURE_NAME NOT LIKE ('% Home% Area')
					AND FEATURE_NAME NOT LIKE ('% Homes')
					AND FEATURE_NAME NOT LIKE ('% Homesites%')
					AND FEATURE_NAME NOT LIKE ('% Hot Spring%')
					AND FEATURE_NAME NOT LIKE ('% Houses')
					AND FEATURE_NAME NOT LIKE ('%Number %')
					AND FEATURE_NAME NOT LIKE ('% Junction')
					AND FEATURE_NAME NOT LIKE ('% Lodge')
					AND FEATURE_NAME NOT LIKE ('% Recreation%')
					AND FEATURE_NAME NOT LIKE ('% Resort')
					AND FEATURE_NAME NOT LIKE ('% Retirement%')
					AND FEATURE_NAME NOT LIKE ('% Road Park')
					AND FEATURE_NAME NOT LIKE ('% Settlement')
					AND FEATURE_NAME NOT LIKE ('% Subdivision%')
					AND FEATURE_NAME NOT LIKE ('% Station')
					AND FEATURE_NAME NOT LIKE ('% Trail')
					AND FEATURE_NAME NOT LIKE ('% Well')
					AND FEATURE_NAME NOT LIKE ('% Windmill')
				)		
				AND STATE_ALPHA NOT IN ('AS','FM','GU','MH','MP','PR','PW','UM','VI')
				AND (PRIM_LAT_DEC > 0.0 OR PRIM_LONG_DEC > 0.0)
				AND FEATURE_NAME NOT LIKE ('%[0-9][0-9][0-9]%')
			UNION
			-- hack to include new york city
			SELECT 
				FEATURE_ID as [id],
				MAP_NAME as principal_name,
				FEATURE_NAME as secondary_name,
				COUNTY_NAME as county,
				STATE_ALPHA as [state],
				PRIM_LAT_DEC as latitude,
				PRIM_LONG_DEC as longitude,
				1
			FROM us_areas_latlong
			WHERE STATE_ALPHA = 'NY' 
				AND FEATURE_NAME IN ('Manhattan', 'New York')
			) dt
		--WHERE is_principal = 1
		) dt
	WHERE [rank] = 1
	),
cities_deduped AS
	(
	SELECT
		[id],
		city,
		[state],
		latitude,
		longitude
	FROM
		(
		SELECT 
			[id],
			city,
			county,
			[state],
			latitude,
			longitude,
			ROW_NUMBER() OVER (PARTITION BY city, county, [state] ORDER BY original_city_name ASC, [id] ASC) as [rank]
		FROM cities
		) dt
	WHERE [rank] = 1
	)

-- insert into a temp table
INSERT INTO @cities ([id], city, [state], latitude, longitude)
	SELECT 
		[id],
		city,
		[state],
		latitude,
		longitude
	FROM cities_deduped
	ORDER BY
		city, [state]

-- comment out the below line if you only want JSON output
SELECT 
	--TOP 1000
	[id],
	city,
	[state],
	latitude as latitude,
	longitude as longitude
FROM @cities
ORDER BY city, [state]
--ORDER BY NEWID()

/*
-- convert to json
SELECT @json = '[' + STUFF((
        SELECT 
			--TOP 1000
            ',{"id":' + CAST([id] as varchar(10))
            + ',"ci":"' + city + '"'
            + ',"st":"' + state + '"'
            + ',"la":"' + CAST(latitude as varchar(12)) + '"'
            + ',"lo":"' + CAST(longitude as varchar(13)) + '"'
            +'}'
        FROM @cities t1
        ORDER BY city, [state]
        --ORDER BY NEWID()
        FOR XML PATH(''), type
    ).value('.', 'varchar(max)'), 1, 1, '') + ']'

-- output long string
DECLARE @counter int = 0,
	@total_prints int = (LEN(@json) / 4000) + 1
	
WHILE @counter < @total_prints
BEGIN
    print SUBSTRING(@json, @counter * 4000, 4000) 
    SET @counter = @counter + 1
END
*/

