# Airseeker

[Airseeker](https://github.com/api3dao/airseeker-v2/) is an application that periodically fetches data from [signed APIs](./signed-api.md) to update on-chain data feeds whenever the conditions specified by the respective [AirseekerRegistry](../contracts/api3-server-v1/airseekerregistry.md) are satisfied.
In the case that the signed APIs are publicly accessible, anyone can operate an Airseeker against any AirseekerRegistry for redundancy.
