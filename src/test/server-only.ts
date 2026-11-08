// Stands in for the `server-only` package under test. The real one throws on
// import anywhere but Next's server runtime, which is exactly what it is for,
// and exactly what a unit test of a server module is not.
export {};
